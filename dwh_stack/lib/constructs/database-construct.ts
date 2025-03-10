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

    // MSSQL用のシークレット作成
    this.mssqlSecret = new secretsmanager.Secret(this, "MssqlSecret", {
      secretName: `${props.config.projectName}-${props.config.environment}-mssql-credentials`,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: "admin" }),
        generateStringKey: "password",
        excludePunctuation: true,
        passwordLength: 16,
      },
    });

    // MSSQL RDSインスタンスの作成
    this.mssqlInstance = new rds.DatabaseInstance(this, "MssqlInstance", {
      engine: rds.DatabaseInstanceEngine.sqlServerEx({
        version: rds.SqlServerEngineVersion.VER_15,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO,
      ),
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_NAT,
      },
      securityGroups: [props.securityGroup],
      allocatedStorage: props.config.rds.mssql.allocatedStorage,
      storageType: rds.StorageType.GP2,
      backupRetention: cdk.Duration.days(
        props.config.rds.mssql.backupRetention,
      ),
      deletionProtection: false,
      multiAz: false,

      credentials: rds.Credentials.fromSecret(this.mssqlSecret),
      // databaseName: props.config.rds.mssql.databaseName,
      port: 1433,
    });

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
      },
      instances: props.config.rds.aurora.instances,
      credentials: rds.Credentials.fromSecret(this.auroraSecret),
      defaultDatabaseName: props.config.rds.aurora.databaseName,
      backup: {
        retention: cdk.Duration.days(1),
      },
      deletionProtection: false,
      storageEncrypted: true,
    });

    // タグ付け
    cdk.Tags.of(this.mssqlInstance).add(
      "Environment",
      props.config.environment,
    );
    cdk.Tags.of(this.mssqlInstance).add("Project", props.config.projectName);
    cdk.Tags.of(this.auroraCluster).add(
      "Environment",
      props.config.environment,
    );
    cdk.Tags.of(this.auroraCluster).add("Project", props.config.projectName);
  }
}
