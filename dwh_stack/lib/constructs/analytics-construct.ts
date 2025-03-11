import * as cdk from "aws-cdk-lib";
import * as glue from "aws-cdk-lib/aws-glue";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import { Construct } from "constructs";
import { AppConfig } from "../../config/config";

export interface AnalyticsProps {
  config: AppConfig;
  rawDataBucket: s3.Bucket;
  processedDataBucket: s3.Bucket;
  s3TablesBucket: s3.Bucket;
  scriptsBucket: s3.Bucket;
}

export class AnalyticsConstruct extends Construct {
  public readonly glueDatabase: glue.CfnDatabase;
  public readonly glueRole: iam.Role;
  public readonly glueCrawler: glue.CfnCrawler;
  public readonly extractTransformJob: glue.CfnJob;
  public readonly createTablesJob: glue.CfnJob;
  public readonly workflow: glue.CfnWorkflow;

  constructor(scope: Construct, id: string, props: AnalyticsProps) {
    super(scope, id);

    // Glue用のIAMロールを作成
    this.glueRole = new iam.Role(this, "GlueServiceRole", {
      assumedBy: new iam.ServicePrincipal("glue.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSGlueServiceRole",
        ),
      ],
    });

    // S3バケットへのアクセス権限を付与
    props.rawDataBucket.grantReadWrite(this.glueRole);
    props.processedDataBucket.grantReadWrite(this.glueRole);
    props.s3TablesBucket.grantReadWrite(this.glueRole);
    props.scriptsBucket.grantRead(this.glueRole);
    

    // Glueデータベースの作成
    this.glueDatabase = new glue.CfnDatabase(this, "GlueDatabase", {
      catalogId: cdk.Aws.ACCOUNT_ID,
      databaseInput: {
        name: `${props.config.projectName.toLowerCase()}_${props.config.environment}_db`,
        description: "Database for Glue crawlers and ETL jobs",
      },
    });

    // 生データ用Glue Crawlerの作成
    this.glueCrawler = new glue.CfnCrawler(this, "RawDataCrawler", {
      name: `${props.config.projectName}-${props.config.environment}-raw-data-crawler`,
      role: this.glueRole.roleArn,
      databaseName: this.glueDatabase.ref,
      targets: {
        s3Targets: [
          {
            path: `s3://${props.rawDataBucket.bucketName}/raw-data/`,
            exclusions: ["**/.tmp/**", "**/.temporary/**"],
          },
        ],
      },
      schedule: {
        scheduleExpression: "cron(0 0/6 * * ? *)", // 6時間ごとに実行
      },
      configuration: JSON.stringify({
        Version: 1.0,
        CrawlerOutput: {
          Partitions: { AddOrUpdateBehavior: "InheritFromTable" },
        },
        // GroupingConfiguration: {
        //   TableGroupingPolicy: "CombineCompatibleSchemas",
        // },
      }),
    });

    // データ抽出・変換用Glue ETLジョブの作成
    this.extractTransformJob = new glue.CfnJob(this, "ExtractTransformJob", {
      name: `${props.config.projectName}-${props.config.environment}-extract-transform-job`,
      role: this.glueRole.roleArn,
      command: {
        name: "glueetl",
        pythonVersion: "3",
        scriptLocation: `s3://${props.scriptsBucket.bucketName}/glue-scripts/extract_transform.py`,
      },
      defaultArguments: {
        "--job-language": "python",
        "--job-bookmark-option": "job-bookmark-enable",
        "--enable-metrics": "",
        "--TempDir": `s3://${props.processedDataBucket.bucketName}/temp/`,
        "--enable-spark-ui": "true",
        "--spark-event-logs-path": `s3://${props.processedDataBucket.bucketName}/spark-logs/`,
        "--enable-continuous-cloudwatch-log": "true",
        "--SOURCE_DATABASE": this.glueDatabase.ref,
        "--RAW_BUCKET": props.rawDataBucket.bucketName,
        "--PROCESSED_BUCKET": props.processedDataBucket.bucketName,
      },
      maxRetries: 1,
      timeout: props.config.glue.timeout,
      numberOfWorkers: props.config.glue.numberOfWorkers,
      workerType: props.config.glue.workerType,
      glueVersion: "3.0",
      executionProperty: {
        maxConcurrentRuns: 1,
      },
    });

    // S3 Tables作成用Glue ETLジョブの作成
    this.createTablesJob = new glue.CfnJob(this, "CreateTablesJob", {
      name: `${props.config.projectName}-${props.config.environment}-create-tables-job`,
      role: this.glueRole.roleArn,
      command: {
        name: "glueetl",
        pythonVersion: "3",
        scriptLocation: `s3://${props.scriptsBucket.bucketName}/glue-scripts/create_tables.py`,
      },
      defaultArguments: {
        "--job-language": "python",
        "--job-bookmark-option": "job-bookmark-enable",
        "--enable-metrics": "",
        "--TempDir": `s3://${props.processedDataBucket.bucketName}/temp/`,
        "--enable-spark-ui": "true",
        "--spark-event-logs-path": `s3://${props.processedDataBucket.bucketName}/spark-logs/`,
        "--enable-continuous-cloudwatch-log": "true",
        "--PROCESSED_BUCKET": props.processedDataBucket.bucketName,
        "--S3TABLES_BUCKET": props.s3TablesBucket.bucketName,
      },
      maxRetries: 1,
      timeout: props.config.glue.timeout,
      numberOfWorkers: props.config.glue.numberOfWorkers,
      workerType: props.config.glue.workerType,
      glueVersion: "3.0",
      executionProperty: {
        maxConcurrentRuns: 1,
      },
    });

    // Glueワークフローの作成（ETLパイプラインの順序制御）
    this.workflow = new glue.CfnWorkflow(this, "DataPipelineWorkflow", {
      name: `${props.config.projectName}-${props.config.environment}-data-pipeline`,
      description:
        "Workflow for data extraction, transformation and loading to S3 Tables",
      defaultRunProperties: {
        "--DATABASE_NAME": this.glueDatabase.ref,
      },
    });

    // ワークフロートリガー：クローラー完了後にETLジョブを実行
    const crawlerTrigger = new glue.CfnTrigger(this, "CrawlerCompleteTrigger", {
      name: `${props.config.projectName}-${props.config.environment}-crawler-complete-trigger`,
      type: "CONDITIONAL",
      description: "Trigger ETL job when crawler completes",
      actions: [
        {
          jobName: this.extractTransformJob.name,
        },
      ],
      predicate: {
        conditions: [
          {
            logicalOperator: "EQUALS",
            crawlerName: this.glueCrawler.name,
            crawlState: "SUCCEEDED",
          },
        ],
        logical: "ANY",
      },
      workflowName: this.workflow.name,
      startOnCreation: true,
    });

    // ワークフロートリガー：ETLジョブ完了後にS3 Tables作成ジョブを実行
    const etlCompleteTrigger = new glue.CfnTrigger(this, "ETLCompleteTrigger", {
      name: `${props.config.projectName}-${props.config.environment}-etl-complete-trigger`,
      type: "CONDITIONAL",
      description: "Trigger S3 Tables creation job when ETL job completes",
      actions: [
        {
          jobName: this.createTablesJob.name,
        },
      ],
      predicate: {
        conditions: [
          {
            logicalOperator: "EQUALS",
            jobName: this.extractTransformJob.name,
            state: "SUCCEEDED",
          },
        ],
        logical: "ANY",
      },
      workflowName: this.workflow.name,
      startOnCreation: true,
    });

    // 依存関係の設定
    crawlerTrigger.addDependency(this.workflow);
    crawlerTrigger.addDependency(this.extractTransformJob);
    crawlerTrigger.addDependency(this.glueCrawler);
    etlCompleteTrigger.addDependency(this.workflow);
    etlCompleteTrigger.addDependency(this.createTablesJob);
    etlCompleteTrigger.addDependency(this.extractTransformJob);

    // タグ付け
    cdk.Tags.of(this.glueRole).add("Environment", props.config.environment);
    cdk.Tags.of(this.glueRole).add("Project", props.config.projectName);
  }
}
