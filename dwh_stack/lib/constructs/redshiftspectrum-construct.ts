import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as redshift from "aws-cdk-lib/aws-redshift";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as cr from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";
import { AppConfig } from "../../config/config";

export interface RedshiftSpectrumProps {
  config: AppConfig;
  s3TablesBucket: s3.Bucket;
  glueDatabaseName: string;
  redshiftCluster: redshift.Cluster;
  redshiftSecret: secretsmanager.Secret;
  redshiftDatabaseName?: string;
}

export class RedshiftSpectrumConstruct extends Construct {
  public readonly spectrumRole: iam.Role;

  constructor(scope: Construct, id: string, props: RedshiftSpectrumProps) {
    super(scope, id);

    // Redshift Spectrum用のIAMロールを作成
    this.spectrumRole = new iam.Role(this, "RedshiftSpectrumRole", {
      assumedBy: new iam.ServicePrincipal("redshift.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonS3ReadOnlyAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AWSGlueConsoleFullAccess"),
      ],
    });

    // S3TablesBucketへの読み取り権限を付与
    props.s3TablesBucket.grantRead(this.spectrumRole);

    // Glue Data Catalogへのアクセス権限を付与
    this.spectrumRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "glue:CreateDatabase",
          "glue:DeleteDatabase",
          "glue:GetDatabase",
          "glue:GetDatabases",
          "glue:UpdateDatabase",
          "glue:CreateTable",
          "glue:DeleteTable",
          "glue:BatchDeleteTable",
          "glue:UpdateTable",
          "glue:GetTable",
          "glue:GetTables",
          "glue:BatchCreatePartition",
          "glue:CreatePartition",
          "glue:DeletePartition",
          "glue:BatchDeletePartition",
          "glue:UpdatePartition",
          "glue:GetPartition",
          "glue:GetPartitions",
          "glue:BatchGetPartition"
        ],
        resources: ["*"],
      })
    );

    // Redshiftに外部スキーマを作成するためのカスタムリソース
    const createExternalSchemaLambda = new lambda.Function(this, "CreateExternalSchemaFunction", {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: "index.handler",
      code: lambda.Code.fromInline(`
        const AWS = require('aws-sdk');
        const { SecretsManager } = require('aws-sdk');
        const { RedshiftData } = require('aws-sdk');
        
        exports.handler = async (event) => {
          console.log('Event: ', JSON.stringify(event, null, 2));
          const { RequestType, ResourceProperties } = event;
          
          if (RequestType === 'Delete') {
            return await sendResponse(event, 'SUCCESS', {});
          }
          
          try {
            // シークレットからRedshift認証情報を取得
            const secretsManager = new SecretsManager();
            const secretData = await secretsManager.getSecretValue({
              SecretId: ResourceProperties.secretArn
            }).promise();
            
            const secretJson = JSON.parse(secretData.SecretString);
            const username = secretJson.username;
            const password = secretJson.password;
            
            // RedshiftDataAPIを使用してSQLを実行
            const redshiftData = new RedshiftData();
            
            // 外部スキーマを作成するSQL
            const createExternalSchemaSQL = \`
              CREATE EXTERNAL SCHEMA IF NOT EXISTS spectrum_schema
              FROM DATA CATALOG
              DATABASE '\${ResourceProperties.glueDatabaseName}'
              IAM_ROLE '\${ResourceProperties.spectrumRoleArn}'
              CREATE EXTERNAL DATABASE IF NOT EXISTS;
            \`;
            
            await redshiftData.executeStatement({
              ClusterIdentifier: ResourceProperties.clusterIdentifier,
              Database: ResourceProperties.databaseName,
              DbUser: username,
              Sql: createExternalSchemaSQL
            }).promise();
            
            return await sendResponse(event, 'SUCCESS', {
              Message: 'External schema created successfully'
            });
          } catch (error) {
            console.error('Error: ', error);
            return await sendResponse(event, 'FAILED', {
              Message: \`Error creating external schema: \${error.message}\`
            });
          }
        };
        
        async function sendResponse(event, responseStatus, responseData) {
          const responseBody = JSON.stringify({
            Status: responseStatus,
            Reason: responseStatus === 'FAILED' ? responseData.Message : 'See the details in CloudWatch Log Stream',
            PhysicalResourceId: event.LogicalResourceId,
            StackId: event.StackId,
            RequestId: event.RequestId,
            LogicalResourceId: event.LogicalResourceId,
            Data: responseData,
          });
          
          console.log('Response Body: ', responseBody);
          
          // CloudFormationにレスポンスを返す（実際の実装では必要）
          // この例では簡略化のため省略
          return { responseBody };
        }
      `),
      timeout: cdk.Duration.minutes(5),
      environment: {
        REGION: cdk.Aws.REGION,
      },
    });

    // Lambda関数に必要な権限を付与
    createExternalSchemaLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          
          "secretsmanager:GetSecretValue",
          "redshift-data:ExecuteStatement",
          "redshift:DescribeClusters",
        ],
        resources: ["*"],
      })
    );

    // カスタムリソースプロバイダーを作成
    const provider = new cr.Provider(this, "RedshiftExternalSchemaProvider", {
      onEventHandler: createExternalSchemaLambda,
    });

    // カスタムリソースを作成して外部スキーマを設定
    const externalSchema = new cdk.CustomResource(this, "RedshiftExternalSchema", {
      serviceToken: provider.serviceToken,
      properties: {
        clusterIdentifier: props.redshiftCluster.clusterName,
        secretArn: props.redshiftSecret.secretArn,
        databaseName: props.redshiftDatabaseName || "dev",
        glueDatabaseName: props.glueDatabaseName,
        spectrumRoleArn: this.spectrumRole.roleArn,
      },
    });

    // タグ付け
    cdk.Tags.of(this.spectrumRole).add("Environment", props.config.environment);
    cdk.Tags.of(this.spectrumRole).add("Project", props.config.projectName);
  }
}