import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import { execSync } from "child_process";
import { AppConfig } from "../../config/config";
import { CfnOutput } from "aws-cdk-lib";

export interface NetworkProps {
  config: AppConfig;
}

export class NetworkConstruct extends Construct {
  public readonly vpc: ec2.Vpc;
  public readonly securityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: NetworkProps) {
    super(scope, id);

    // VPCの作成
    this.vpc = new ec2.Vpc(this, "Vpc", {
      vpcName: "stkd-my-vpc",
      maxAzs: props.config.vpc.maxAzs,
      natGateways: props.config.vpc.natGateways,
      subnetConfiguration: [
        {
          name: "public",
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: "private",
          subnetType: ec2.SubnetType.PRIVATE_WITH_NAT,
          cidrMask: 24,
        },
        {
          name: "isolated",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });

    // 現在のグローバルIPを取得
    let myIp;
    try {
      myIp = execSync("bash ./scripts/get-my-ip.sh").toString().trim() + "/32";
      console.log(`Using current global IP: ${myIp}`);
    } catch (error) {
      console.warn("Failed to get current IP, using fallback IP");
      myIp = "202.213.234.0/0"; // フォールバック（本番環境では使用しないでください）
    }

    // セキュリティグループの作成
    this.securityGroup = new ec2.SecurityGroup(this, "SecurityGroup", {
      vpc: this.vpc,
      description: "Allow access from my global IP only",
      allowAllOutbound: false,
      securityGroupName: "stkdSecurityGroup",
    });
    this.securityGroup.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.allTcp(),
      "allow all tcp",
    );

    this.securityGroup.connections.allowFrom(
      this.securityGroup,
      ec2.Port.allTcp(),
      "allow tcp from sg",
    );
    const array = [
      ec2.Port.tcp(22),
      ec2.Port.tcp(3306),
      ec2.Port.tcp(1433),
      ec2.Port.tcp(1521),
    ];
    for (let index = 0; index < array.length; index++) {
      const port = array[index];

      // 現在のグローバルIPからのみアクセスを許可
      this.securityGroup.addIngressRule(
        ec2.Peer.ipv4(myIp),
        port,
        "Allow all traffic from my global IP",
      );
      this.vpc.privateSubnets.map((subnet) =>
        this.securityGroup.addIngressRule(
          ec2.Peer.ipv4(subnet.ipv4CidrBlock),
          port,
          "Allow all traffic from private subnets",
        ),
      );
      this.vpc.publicSubnets.map((subnet) =>
        this.securityGroup.addIngressRule(
          ec2.Peer.ipv4(subnet.ipv4CidrBlock),
          port,
          "Allow all traffic from public subnets",
        ),
      );
    }

    // キーペア作成
    const cfnKeyPair = new ec2.CfnKeyPair(this, "CfnKeyPair", {
      keyName: "stkd-key-pair",
    });
    cfnKeyPair.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);

    // キーペア取得コマンドアウトプット
    new CfnOutput(this, "GetSSHKeyCommand", {
      value: `aws ssm get-parameter --name /ec2/keypair/${cfnKeyPair.getAtt("KeyPairId")} --region ap-northeast-1  --with-decryption --query Parameter.Value --output text`,
    });

    // EC2作成
    const instance = new ec2.Instance(this, "Instance", {
      vpc: this.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.NANO,
      ),
      machineImage: new ec2.AmazonLinux2023ImageSsmParameter(),
      keyName: cdk.Token.asString(cfnKeyPair.ref),
      securityGroup: this.securityGroup,
    });
    new CfnOutput(this, "SSHCommand", {
      value: `ssh -lec2-user ${instance.instancePublicDnsName}`,
    });

    // タグ付け
    cdk.Tags.of(this.vpc).add("Environment", props.config.environment);
    cdk.Tags.of(this.vpc).add("Project", props.config.projectName);
    cdk.Tags.of(this.securityGroup).add(
      "Environment",
      props.config.environment,
    );
    cdk.Tags.of(this.securityGroup).add("Project", props.config.projectName);
  }
}
