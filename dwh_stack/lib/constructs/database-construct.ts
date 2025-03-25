import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";
import { AppConfig } from "../../config/config";

export interface DatabaseProps {
  config: AppConfig;
  vpc: ec2.Vpc;
  securityGroup: ec2.SecurityGroup;
}

export class DatabaseConstruct extends Construct {
  public readonly mssqlInstance: rds.DatabaseInstance;
  public readonly auroraCluster: rds.DatabaseCluster;
  public readonly oracleInstance: rds.DatabaseInstance;
  public readonly mssqlSecret: secretsmanager.Secret;
  public readonly auroraSecret: secretsmanager.Secret;
  public readonly oracleSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: DatabaseProps) {
    super(scope, id);

    // Aurora MySQL用のシークレット作成
    this.auroraSecret = new secretsmanager.Secret(this, "AuroraSecret", {
      secretName: `${props.config.projectName}-${props.config.environment}-aurora-credentials`,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: "admin" }),
        generateStringKey: "password",
        excludePunctuation: true,
        passwordLength: 16,
      },
    });
    // Oracle用のシークレット作成
    this.oracleSecret = new secretsmanager.Secret(this, "OracleSecret", {
      secretName: `${props.config.projectName}-${props.config.environment}-oracle-credentials`,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: "admin" }),
        generateStringKey: "password",
        excludePunctuation: true,
        passwordLength: 16,
      },
    });

    const auroraClusterParameterGroup = new rds.ParameterGroup(
      this,
      "AuroraClusterParameterGroup",
      {
        engine: rds.DatabaseClusterEngine.auroraMysql({
          version: rds.AuroraMysqlEngineVersion.VER_3_04_0,
        }),
        description: `${props.config.projectName}-${props.config.environment} Aurora MySQL cluster parameter group with binary logging enabled`,
        parameters: {
          binlog_format: "ROW",
          // expire_logs_days: "2",
          binlog_row_image: "Full",
        },
      },
    );

    // Aurora MySQLのDBインスタンスパラメータグループを作成（必要に応じて）
    const auroraInstanceParameterGroup = new rds.ParameterGroup(
      this,
      "AuroraInstanceParameterGroup",
      {
        engine: rds.DatabaseClusterEngine.auroraMysql({
          version: rds.AuroraMysqlEngineVersion.VER_3_04_0,
        }),
        description: `${props.config.projectName}-${props.config.environment} Aurora MySQL instance parameter group`,
        // インスタンスレベルのパラメータが必要な場合はここに追加
      },
    );

    // Aurora MySQLクラスターの作成
    this.auroraCluster = new rds.DatabaseCluster(this, "AuroraCluster", {
      engine: rds.DatabaseClusterEngine.auroraMysql({
        version: rds.AuroraMysqlEngineVersion.VER_3_04_0,
      }),
      instanceProps: {
        instanceType: ec2.InstanceType.of(
          ec2.InstanceClass.T3,
          ec2.InstanceSize.LARGE,
        ),
        vpc: props.vpc,
        vpcSubnets: {
          subnetType: ec2.SubnetType.PRIVATE_WITH_NAT,
        },
        securityGroups: [props.securityGroup],
        parameterGroup: auroraInstanceParameterGroup, // インスタンスパラメータグループを適用
      },
      instances: props.config.rds.aurora.instances,
      credentials: rds.Credentials.fromSecret(this.auroraSecret),
      defaultDatabaseName: props.config.rds.aurora.databaseName,
      backup: {
        retention: cdk.Duration.days(1),
      },
      deletionProtection: false,
      storageEncrypted: true,
      parameterGroup: auroraClusterParameterGroup, // クラスターパラメータグループを適用
    });

    // Oracle用のパラメータグループを作成
    const oracleParameterGroup = new rds.ParameterGroup(
      this,
      "OracleParameterGroup",
      {
        name: `${props.config.projectName}-${props.config.environment}-oracle-pg`.toLowerCase(),
        engine: rds.DatabaseInstanceEngine.oracleSe2({
          version: rds.OracleEngineVersion.VER_19_0_0_0_2021_04_R1,
        }),
        description: `${props.config.projectName}-${props.config.environment} Oracle parameter group`,
        // 必要なパラメータがあればここに追加
      },
    );

    // Oracle DBインスタンスの作成
    this.oracleInstance = new rds.DatabaseInstance(this, "OracleInstance", {
      engine: rds.DatabaseInstanceEngine.oracleSe2({
        version: rds.OracleEngineVersion.VER_19_0_0_0_2021_04_R1,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.LARGE,
      ),
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_NAT,
      },
      securityGroups: [props.securityGroup],
      credentials: rds.Credentials.fromSecret(this.oracleSecret),
      databaseName: props.config.rds.oracle?.databaseName || "ORCL",
      parameterGroup: oracleParameterGroup,
      storageEncrypted: true,
      allocatedStorage: props.config.rds.oracle?.allocatedStorage || 20,
      maxAllocatedStorage: props.config.rds.oracle?.maxAllocatedStorage || 100,
      backupRetention: cdk.Duration.days(1),
      deletionProtection: false,
      licenseModel: rds.LicenseModel.LICENSE_INCLUDED,
      optionGroup: new rds.OptionGroup(this, "OracleOptionGroup", {
        configurations: [],
        engine: rds.DatabaseInstanceEngine.oracleSe2({
          version: rds.OracleEngineVersion.VER_19_0_0_0_2021_04_R1,
        }),
        description: `${props.config.projectName}-${props.config.environment} Oracle option group`,
      }),
    });

    // タグ付け

    cdk.Tags.of(this.auroraCluster).add(
      "Environment",
      props.config.environment,
    );
    cdk.Tags.of(this.auroraCluster).add("Project", props.config.projectName);
  }
}
