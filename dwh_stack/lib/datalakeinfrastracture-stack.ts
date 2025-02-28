import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as glue from 'aws-cdk-lib/aws-glue';
import * as lakeformation from 'aws-cdk-lib/aws-lakeformation';
import * as kms from 'aws-cdk-lib/aws-kms';

export class DataLakeInfrastructureStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // KMSキーの作成（暗号化用）
    const dataLakeKey = new kms.Key(this, 'DataLakeEncryptionKey', {
      enableKeyRotation: true,
      description: 'KMS key for data lake encryption',
      alias: 'alias/data-lake-key',
    });

    // データレイク用S3バケットの作成
    const dataLakeBucket = new s3.Bucket(this, 'DataLakeBucket', {
      bucketName: `${this.account}-data-lake-${this.region}`,
      versioned: true,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: dataLakeKey,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      lifecycleRules: [
        {
          id: 'ArchiveAfter90Days',
          transitions: [
            {
              storageClass: s3.StorageClass.INTELLIGENT_TIERING,
              transitionAfter: cdk.Duration.days(90),
            },
          ],
        },
      ],
    });

    // データレイクのディレクトリ構造を定義
    const rawZone = `s3://${dataLakeBucket.bucketName}/raw/`;
    const stagingZone = `s3://${dataLakeBucket.bucketName}/staging/`;
    const processedZone = `s3://${dataLakeBucket.bucketName}/processed/`;
    const analyticsZone = `s3://${dataLakeBucket.bucketName}/analytics/`;

    // Glue用のIAMロール
    const glueServiceRole = new iam.Role(this, 'GlueServiceRole', {
      assumedBy: new iam.ServicePrincipal('glue.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSGlueServiceRole'),
      ],
    });

    // S3バケットへのアクセス権限を付与
    dataLakeBucket.grantReadWrite(glueServiceRole);
    dataLakeKey.grantEncryptDecrypt(glueServiceRole);

    // Glueデータベースの作成
    const rawDatabase = new glue.CfnDatabase(this, 'RawDatabase', {
      catalogId: this.account,
      databaseInput: {
        name: 'raw_data',
        description: 'Raw data from various sources',
      },
    });

    const processedDatabase = new glue.CfnDatabase(this, 'ProcessedDatabase', {
      catalogId: this.account,
      databaseInput: {
        name: 'processed_data',
        description: 'Processed and transformed data',
      },
    });

    const analyticsDatabase = new glue.CfnDatabase(this, 'AnalyticsDatabase', {
      catalogId: this.account,
      databaseInput: {
        name: 'analytics_data',
        description: 'Analytics-ready data models',
      },
    });

    // Lake Formation設定
    const lakeFormationAdmin = new lakeformation.CfnDataLakeSettings(this, 'LakeFormationSettings', {
      admins: [
        {
          dataLakePrincipalIdentifier: glueServiceRole.roleArn,
        },
      ],
    });

    // Lake FormationでS3バケットを登録
    const lakeFormationResource = new lakeformation.CfnResource(this, 'LakeFormationS3Resource', {
      resourceArn: dataLakeBucket.bucketArn,
      useServiceLinkedRole: true,
    });

    // 出力値の定義
    new cdk.CfnOutput(this, 'DataLakeBucketName', {
      value: dataLakeBucket.bucketName,
      description: 'Data Lake S3 Bucket Name',
    });

    new cdk.CfnOutput(this, 'RawDatabaseName', {
      value: 'raw_data',
      description: 'Glue Raw Database Name',
    });

    new cdk.CfnOutput(this, 'ProcessedDatabaseName', {
      value: 'processed_data',
      description: 'Glue Processed Database Name',
    });

    new cdk.CfnOutput(this, 'AnalyticsDatabaseName', {
      value: 'analytics_data',
      description: 'Glue Analytics Database Name',
    });
  }
}