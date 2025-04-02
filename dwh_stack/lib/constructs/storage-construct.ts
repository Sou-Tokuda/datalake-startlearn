import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import { Construct } from "constructs";
import { AppConfig } from "../../config/config";

export interface StorageProps {
  config: AppConfig;
}

export class StorageConstruct extends Construct {
  public readonly rawDataBucket: s3.Bucket;
  public readonly processedDataBucket: s3.Bucket;
  public readonly s3TablesBucket: s3.Bucket;
  public readonly scriptsBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: StorageProps) {
    super(scope, id);

    // 生データ用S3バケットの作成
    this.rawDataBucket = new s3.Bucket(this, "RawDataBucket", {
      bucketName: `${props.config.projectName.toLowerCase()}-${props.config.environment}-raw-data-${this.node.addr.substring(0, 8)}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy:
        props.config.environment === "prod"
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: props.config.environment !== "prod",
      versioned: false,
      lifecycleRules: [
        {
          id: "archive-after-90-days",
          enabled: true,
          transitions: [
            {
              storageClass: s3.StorageClass.INTELLIGENT_TIERING,
              transitionAfter: cdk.Duration.days(90),
            },
          ],
        },
      ],
    });

    // 処理済みデータ用S3バケットの作成
    this.processedDataBucket = new s3.Bucket(this, "ProcessedDataBucket", {
      bucketName: `${props.config.projectName.toLowerCase()}-${props.config.environment}-processed-data-${this.node.addr.substring(0, 8)}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy:
        props.config.environment === "prod"
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: props.config.environment !== "prod",
      versioned: false,
    });

    // S3Tables用バケットの作成
    this.s3TablesBucket = new s3.Bucket(this, "S3TablesBucket", {
      bucketName: `${props.config.projectName.toLowerCase()}-${props.config.environment}-s3tables-${this.node.addr.substring(0, 8)}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy:
        props.config.environment === "prod"
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: props.config.environment !== "prod",
      versioned: true, // S3 Tablesでは通常バージョニングが推奨
    });

    // Glueスクリプト用バケットの作成
    this.scriptsBucket = new s3.Bucket(this, "ScriptsBucket", {
      bucketName: `${props.config.projectName.toLowerCase()}-${props.config.environment}-scripts-${this.node.addr.substring(0, 8)}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      autoDeleteObjects: props.config.environment !== "prod",
      removalPolicy:
        props.config.environment === "prod"
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
    });

    // SQLスクリプトをデプロイ
    new s3deploy.BucketDeployment(this, "DeploySqlScripts", {
      sources: [s3deploy.Source.asset("./scripts/sql")],
      destinationBucket: this.scriptsBucket,
      destinationKeyPrefix: "sql-scripts",
    });

    // Glueスクリプトをデプロイ
    new s3deploy.BucketDeployment(this, "DeployGlueScripts", {
      sources: [s3deploy.Source.asset("./scripts/glue")],
      destinationBucket: this.scriptsBucket,
      destinationKeyPrefix: "glue-scripts",
    });
    // Glueスクリプトをデプロイ
    new s3deploy.BucketDeployment(this, "DeployGlueDrivers", {
      sources: [s3deploy.Source.asset("./drivers")],
      destinationBucket: this.scriptsBucket,
      destinationKeyPrefix: "glue-drivers",
    });

    // タグ付け
    cdk.Tags.of(this.rawDataBucket).add(
      "Environment",
      props.config.environment,
    );
    cdk.Tags.of(this.rawDataBucket).add("Project", props.config.projectName);
    cdk.Tags.of(this.processedDataBucket).add(
      "Environment",
      props.config.environment,
    );
    cdk.Tags.of(this.processedDataBucket).add(
      "Project",
      props.config.projectName,
    );
    cdk.Tags.of(this.s3TablesBucket).add(
      "Environment",
      props.config.environment,
    );
    cdk.Tags.of(this.s3TablesBucket).add("Project", props.config.projectName);
    cdk.Tags.of(this.scriptsBucket).add(
      "Environment",
      props.config.environment,
    );
    cdk.Tags.of(this.scriptsBucket).add("Project", props.config.projectName);
  }
}
