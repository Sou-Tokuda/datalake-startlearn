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
  public readonly mssqlSecret: secretsmanager.Secret;
  public readonly auroraSecret: secretsmanager.Secret;

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

    // タグ付け

    cdk.Tags.of(this.auroraCluster).add(
      "Environment",
      props.config.environment,
    );
    cdk.Tags.of(this.auroraCluster).add("Project", props.config.projectName);
  }
}
