import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as redshiftServerless from "aws-cdk-lib/aws-redshiftserverless";
import { Construct } from "constructs";
import { AppConfig } from "../../config/config";

export interface RedshiftServerlessProps {
  config: AppConfig;
  vpc: ec2.Vpc;
  securityGroup?: ec2.SecurityGroup;
  subnetGroup?: string[];
  adminUsername?: string;
  baseCapacity?: number;
  databaseName?: string;
}

export class RedshiftServerlessConstruct extends Construct {
  public readonly namespace: redshiftServerless.CfnNamespace;
  public readonly workgroup: redshiftServerless.CfnWorkgroup;
  public readonly adminSecret: secretsmanager.Secret;
  public readonly databaseName: string;

  constructor(scope: Construct, id: string, props: RedshiftServerlessProps) {
    super(scope, id);

    // デフォルト値の設定
    const adminUsername = props.adminUsername || "admin";
    this.databaseName = props.databaseName || "dev";
    const baseCapacity = props.baseCapacity || 8; // デフォルトは8 RPU

    // 管理者パスワードのシークレットを作成
    this.adminSecret = new secretsmanager.Secret(this, "RedshiftServerlessAdminSecret", {
      secretName: `${props.config.projectName}-${props.config.environment}-redshift-admin`,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: adminUsername }),
        generateStringKey: "password",
        excludePunctuation: true,
        includeSpace: false,
        passwordLength: 16,
      },
    });

    // Redshift Serverless用のIAMロールを作成
    const redshiftServerlessRole = new iam.Role(this, "RedshiftServerlessRole", {
      assumedBy: new iam.ServicePrincipal("redshift-serverless.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonS3ReadOnlyAccess"),
      ],
    });
    
    // Redshift Serverless Namespaceを作成
    this.namespace = new redshiftServerless.CfnNamespace(this, "RedshiftServerlessNamespace", {
      namespaceName: `${props.config.projectName}-${props.config.environment}-ns`,
      adminUsername: adminUsername,
    //   adminUserPassword: this.adminSecret.secretValueFromJson("password").toString(),
    adminUserPassword: this.adminSecret.secretValueFromJson("password").unsafeUnwrap(),
    //   manageAdminPassword: this.adminSecret.secretValue.unsafeUnwrap(),
      dbName: this.databaseName,
      iamRoles: [redshiftServerlessRole.roleArn],
      logExports: ["userlog", "connectionlog", "useractivitylog"],
      tags: [
        { key: "Environment", value: props.config.environment },
        { key: "Project", value: props.config.projectName },
      ],
    });

    // セキュリティグループの作成または使用
    let securityGroup: ec2.SecurityGroup;
    if (props.securityGroup) {
      securityGroup = props.securityGroup;
    } else {
      securityGroup = new ec2.SecurityGroup(this, "RedshiftServerlessSG", {
        vpc: props.vpc,
        description: "Security Group for Redshift Serverless",
        allowAllOutbound: true,
      });
      
      // 必要に応じてインバウンドルールを追加
      securityGroup.addIngressRule(
        ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
        ec2.Port.tcp(5439),
        "Allow Redshift traffic within VPC"
      );
    }

    // サブネットグループの設定
    const subnetIds = props.subnetGroup || 
      props.vpc.selectSubnets({
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      }).subnetIds;

    // Redshift Serverless Workgroupを作成
    this.workgroup = new redshiftServerless.CfnWorkgroup(this, "RedshiftServerlessWorkgroup", {
      workgroupName: `${props.config.projectName}-${props.config.environment}-wg`,
      baseCapacity: baseCapacity,
      namespaceName: this.namespace.namespaceName,
      securityGroupIds: [securityGroup.securityGroupId],
      subnetIds: subnetIds,
      publiclyAccessible: false, // セキュリティのため非公開に設定
      enhancedVpcRouting: true, // VPC内のネットワークトラフィックを強制
      tags: [
        { key: "Environment", value: props.config.environment },
        { key: "Project", value: props.config.projectName },
      ],
    });

    // 依存関係の設定
    this.workgroup.addDependency(this.namespace);

    // 出力の設定
    new cdk.CfnOutput(this, "RedshiftServerlessNamespaceId", {
      value: this.namespace.attrNamespaceNamespaceId,
      description: "Redshift Serverless Namespace ID",
    });

    new cdk.CfnOutput(this, "RedshiftServerlessWorkgroupId", {
      value: this.workgroup.attrWorkgroupWorkgroupId,
      description: "Redshift Serverless Workgroup ID",
    });

    new cdk.CfnOutput(this, "RedshiftServerlessEndpoint", {
      value: this.workgroup.attrWorkgroupEndpointAddress,
      description: "Redshift Serverless Endpoint",
    });

    new cdk.CfnOutput(this, "RedshiftServerlessSecretArn", {
      value: this.adminSecret.secretArn,
      description: "Redshift Serverless Admin Secret ARN",
    });
  }
}