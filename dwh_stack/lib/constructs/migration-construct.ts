import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as dms from "aws-cdk-lib/aws-dms";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";
import { AppConfig } from "../../config/config";

export interface MigrationProps {
  config: AppConfig;
  vpc: ec2.Vpc;
  securityGroup: ec2.SecurityGroup;
  mssqlInstance: any; // RDS DatabaseInstance
  auroraCluster: any; // RDS DatabaseCluster
  mssqlSecret: secretsmanager.Secret;
  auroraSecret: secretsmanager.Secret;
  rawDataBucket: s3.Bucket;
}

export class MigrationConstruct extends Construct {
  public readonly dmsRole: iam.Role;
  public readonly dmsReplicationInstance: dms.CfnReplicationInstance;
  public readonly mssqlEndpoint: dms.CfnEndpoint;
  public readonly auroraEndpoint: dms.CfnEndpoint;
  public readonly s3Endpoint: dms.CfnEndpoint;
  public readonly mssqlToS3Task: dms.CfnReplicationTask;
  public readonly auroraToS3Task: dms.CfnReplicationTask;

  constructor(scope: Construct, id: string, props: MigrationProps) {
    super(scope, id);
    // DMS用のIAMロールを作成
    this.dmsRole = new iam.Role(this, "DMSRole", {
      // リージョン固有のDMSサービスプリンシパルを信頼ポリシーに追加
      assumedBy: new iam.CompositePrincipal(
        new iam.ServicePrincipal("dms.amazonaws.com"),
        new iam.ServicePrincipal("dms.ap-northeast-1.amazonaws.com"),
      ),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AmazonDMSVPCManagementRole",
        ),
      ],
    });
    this.dmsRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret",
        ],
        resources: [props.mssqlSecret.secretArn, props.auroraSecret.secretArn],
      }),
    );
    this.dmsRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["iam:PassRole"],
        resources: [this.dmsRole.roleArn],
      }),
    );
    // S3バケットへのアクセス権限を付与
    props.rawDataBucket.grantReadWrite(this.dmsRole);

    const s3Bucket = new cdk.aws_s3.Bucket(
      this,
      "DmsS3PremigrationAssessmentBucket",
      {
        bucketName: "test-dms-s3-premigration-assessment-bucket",
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        autoDeleteObjects: true,
        blockPublicAccess: cdk.aws_s3.BlockPublicAccess.BLOCK_ALL,
      },
    );
    const premigrationAssessmentPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:GetObject",
        "s3:PutObjectTagging",
        "s3:ListBucket",
        "s3:GetBucketLocation",
      ],
      resources: [s3Bucket.bucketArn, `${s3Bucket.bucketArn}/*`],
    });
    s3Bucket.grantReadWrite(this.dmsRole);
    this.dmsRole.addToPolicy(premigrationAssessmentPolicy);

    // DMSレプリケーションサブネットグループの作成
    const subnetGroup = new dms.CfnReplicationSubnetGroup(
      this,
      "DMSSubnetGroup",
      {
        replicationSubnetGroupDescription:
          "Subnet group for DMS replication instance",
        subnetIds: props.vpc.privateSubnets.map((subnet) => subnet.subnetId),
      },
    );

    // DMSレプリケーションインスタンスの作成
    this.dmsReplicationInstance = new dms.CfnReplicationInstance(
      this,
      "DMSReplicationInstance",
      {
        resourceIdentifier: "stkdDMSReplicationInstance",
        replicationInstanceClass: `dms.${props.config.dms.instanceType}`,
        allocatedStorage: 20,
        vpcSecurityGroupIds: [props.securityGroup.securityGroupId],
        replicationSubnetGroupIdentifier: subnetGroup.ref,
        publiclyAccessible: false,
        multiAz: false,
        engineVersion: "3.5.3",
        autoMinorVersionUpgrade: true,
      },
    );

    if (false) {
      // MSSQL用のエンドポイント作成
      this.mssqlEndpoint = new dms.CfnEndpoint(this, "MssqlEndpoint", {
        endpointIdentifier: "stkdMssqlEndpoint",
        endpointType: "source",
        engineName: "sqlserver",
        // serverName: props.mssqlInstance.dbInstanceEndpointAddress,
        // port: 1433,
        databaseName: props.config.rds.mssql.databaseName,
        // username: "admin",
        // password: "password", // TODO: non production mode
        microsoftSqlServerSettings: {
          secretsManagerSecretId: props.mssqlSecret.secretArn,
          secretsManagerAccessRoleArn: this.dmsRole.roleArn,
        },

        sslMode: "none",
      });
    }
    // Aurora MySQL用のエンドポイント作成
    this.auroraEndpoint = new dms.CfnEndpoint(this, "AuroraEndpoint", {
      endpointIdentifier: "stkdAuroraEndpoint",
      endpointType: "source",
      engineName: "aurora",
      // serverName: props.auroraCluster.clusterEndpoint.hostname,
      // port: 3306,
      mySqlSettings: {
        secretsManagerSecretId: props.auroraSecret.secretArn,
        secretsManagerAccessRoleArn: this.dmsRole.roleArn,
      },
      databaseName: props.config.rds.aurora.databaseName,
      // username: "admin",
      // password: "password", //TODO: non production mode
      sslMode: "none",
    });

    // S3ターゲットエンドポイントの作成
    this.s3Endpoint = new dms.CfnEndpoint(this, "S3Endpoint", {
      endpointIdentifier: "stkdS3Endpoint",
      endpointType: "target",
      engineName: "s3",

      s3Settings: {
        bucketName: props.rawDataBucket.bucketName,
        serviceAccessRoleArn: this.dmsRole.roleArn,
        bucketFolder: "raw-data",
        parquetTimestampInMillisecond: true,
        dataFormat: "parquet",
        parquetVersion: "parquet_2_0",
        compressionType: "GZIP",
        // csvDelimiter: ",",
        // csvRowDelimiter: "\\n",
        addColumnName: true,
      },
    });

    if (false) {
      // MSSQL -> S3 レプリケーションタスクの作成
      this.mssqlToS3Task = new dms.CfnReplicationTask(this, "MssqlToS3Task", {
        resourceIdentifier: "stkdMssqlToS3Task",
        migrationType: "full-load-and-cdc",
        replicationInstanceArn: this.dmsReplicationInstance.ref,
        sourceEndpointArn: this.mssqlEndpoint.ref,
        targetEndpointArn: this.s3Endpoint.ref,
        tableMappings: JSON.stringify({
          rules: [
            {
              "rule-type": "selection",
              "rule-id": "1",
              "rule-name": "1",
              "object-locator": {
                "schema-name": "dbo",
                "table-name": "%",
              },
              "rule-action": "include",
            },
          ],
        }),
        replicationTaskSettings: JSON.stringify({
          TargetMetadata: {
            TargetSchema: "",
            SupportLobs: true,
            FullLobMode: false,
            LobChunkSize: 64,
            LimitedSizeLobMode: true,
            LobMaxSize: 32,
          },
          FullLoadSettings: {
            FullLoadEnabled: true,
            ApplyChangesEnabled: true,
            TargetTablePrepMode: "DO_NOTHING",
            CreatePkAfterFullLoad: false,
            StopTaskCachedChangesApplied: false,
            StopTaskCachedChangesNotApplied: false,
            MaxFullLoadSubTasks: 8,
            TransactionConsistencyTimeout: 600,
            CommitRate: 10000,
          },
          Logging: {
            EnableLogging: true,
          },
          ChangeProcessingTuning: {
            BatchApplyEnabled: true,
            BatchApplyPreserveTransaction: true,
            BatchApplyTimeoutMin: 1,
            BatchApplyTimeoutMax: 30,
            BatchApplyMemoryLimit: 500,
            BatchSplitSize: 0,
            MinTransactionSize: 1000,
            CommitTimeout: 1,
            MemoryLimitTotal: 1024,
            MemoryKeepTime: 60,
            StatementCacheSize: 50,
          },
        }),
      });
    }
    // Aurora -> S3 レプリケーションタスクの作成
    this.auroraToS3Task = new dms.CfnReplicationTask(this, "AuroraToS3Task", {
      resourceIdentifier: "stkdAuroraToS3Task",
      migrationType: "full-load-and-cdc",
      replicationInstanceArn: this.dmsReplicationInstance.ref,
      sourceEndpointArn: this.auroraEndpoint.ref,
      targetEndpointArn: this.s3Endpoint.ref,
      tableMappings: JSON.stringify({
        rules: [
          {
            "rule-type": "selection",
            "rule-id": "1",
            "rule-name": "1",
            "object-locator": {
              "schema-name": props.config.rds.aurora.databaseName,
              "table-name": "%",
            },
            "rule-action": "include",
          },
        ],
      }),
      replicationTaskSettings: JSON.stringify({
        TargetMetadata: {
          TargetSchema: "",
          SupportLobs: true,
          FullLobMode: false,
          LobChunkSize: 64,
          LimitedSizeLobMode: true,
          LobMaxSize: 32,
        },
        // FullLoadSettings: {
        //   FullLoadEnabled: true,
        //   ApplyChangesEnabled: true,
        //   TargetTablePrepMode: "DO_NOTHING",
        //   CreatePkAfterFullLoad: false,
        //   StopTaskCachedChangesApplied: false,
        //   StopTaskCachedChangesNotApplied: false,
        //   MaxFullLoadSubTasks: 8,
        //   TransactionConsistencyTimeout: 600,
        //   CommitRate: 10000,
        // },
        FullLoadSettings: {
          CreatePkAfterFullLoad: false,
          StopTaskCachedChangesApplied: false,
          StopTaskCachedChangesNotApplied: false,
          MaxFullLoadSubTasks: 8,
          TransactionConsistencyTimeout: 900,
          CommitRate: 10000,
        },
        Logging: {
          EnableLogging: true,
          LogComponents: [
            {
              Id: "SOURCE_UNLOAD",
              Severity: "LOGGER_SEVERITY_DEFAULT",
            },
            {
              Id: "SOURCE_CAPTURE",
              Severity: "LOGGER_SEVERITY_DEFAULT",
            },
            {
              Id: "TARGET_LOAD",
              Severity: "LOGGER_SEVERITY_DEFAULT",
            },
            {
              Id: "TARGET_APPLY",
              Severity: "LOGGER_SEVERITY_DEFAULT",
            },
            {
              Id: "TASK_MANAGER",
              Severity: "LOGGER_SEVERITY_DEFAULT",
            },
          ],
        },
        ChangeProcessingTuning: {
          BatchApplyEnabled: true,
          BatchApplyPreserveTransaction: true,
          BatchApplyTimeoutMin: 1,
          BatchApplyTimeoutMax: 30,
          BatchApplyMemoryLimit: 500,
          BatchSplitSize: 0,
          MinTransactionSize: 1000,
          CommitTimeout: 1,
          MemoryLimitTotal: 1024,
          MemoryKeepTime: 60,
          StatementCacheSize: 50,
        },
      }),
    });

    // タグ付け
    cdk.Tags.of(this.dmsReplicationInstance).add(
      "Environment",
      props.config.environment,
    );
    cdk.Tags.of(this.dmsReplicationInstance).add(
      "Project",
      props.config.projectName,
    );
  }
}
