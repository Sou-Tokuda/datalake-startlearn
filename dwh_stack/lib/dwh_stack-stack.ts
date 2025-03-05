import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { NetworkConstruct } from "./constructs/network-construct";
import { DatabaseConstruct } from "./constructs/database-construct";
import { StorageConstruct } from "./constructs/storage-construct";
import { MigrationConstruct } from "./constructs/migration-construct";
import { AnalyticsConstruct } from "./constructs/analytics-construct";
import { getConfig } from "../config/config";

export class MyStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 設定を取得
    const config = getConfig();

    // ネットワークリソースの作成
    const network = new NetworkConstruct(this, "Network", {
      config: config,
    });

    // ストレージリソースの作成
    const storage = new StorageConstruct(this, "Storage", {
      config: config,
    });

    // データベースリソースの作成
    const database = new DatabaseConstruct(this, "Database", {
      config: config,
      vpc: network.vpc,
      securityGroup: network.securityGroup,
    });

    // データ移行リソースの作成
    const migration = new MigrationConstruct(this, "Migration", {
      config: config,
      vpc: network.vpc,
      securityGroup: network.securityGroup,
      mssqlInstance: database.mssqlInstance,
      auroraCluster: database.auroraCluster,
      mssqlSecret: database.mssqlSecret,
      auroraSecret: database.auroraSecret,
      rawDataBucket: storage.rawDataBucket,
    });

    // 分析基盤リソースの作成
    const analytics = new AnalyticsConstruct(this, 'Analytics', {
      config: config,
      rawDataBucket: storage.rawDataBucket,
      processedDataBucket: storage.processedDataBucket,
      s3TablesBucket: storage.s3TablesBucket,
      scriptsBucket: storage.scriptsBucket,
    });

    // 出力値の定義
    new cdk.CfnOutput(this, 'VpcId', {
      value: network.vpc.vpcId,
      description: 'VPC ID',
    });

    // new cdk.CfnOutput(this, 'MssqlEndpoint', {
    //   value: database.mssqlInstance.dbInstanceEndpointAddress,
    //   description: 'MSSQL Endpoint',
    // });

    // new cdk.CfnOutput(this, 'AuroraEndpoint', {
    //   value: database.auroraCluster.clusterEndpoint.hostname,
    //   description: 'Aurora Endpoint',
    // });

    // new cdk.CfnOutput(this, 'RawDataBucketName', {
    //   value: storage.rawDataBucket.bucketName,
    //   description: 'Raw Data Bucket Name',
    // });

    // new cdk.CfnOutput(this, 'ProcessedDataBucketName', {
    //   value: storage.processedDataBucket.bucketName,
    //   description: 'Processed Data Bucket Name',
    // });

    // new cdk.CfnOutput(this, 'S3TablesBucketName', {
    //   value: storage.s3TablesBucket.bucketName,
    //   description: 'S3 Tables Bucket Name',
    // });

    // new cdk.CfnOutput(this, 'GlueDatabaseName', {
    //   value: analytics.glueDatabase.ref,
    //   description: 'Glue Database Name',
    // });

    // new cdk.CfnOutput(this, 'GlueWorkflowName', {
    //   value: analytics.workflow.name!,
    //   description: 'Glue Workflow Name',
    // });
  }
}
