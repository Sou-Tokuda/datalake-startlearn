import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import { execSync } from "child_process";
import { AppConfig } from "../../config/config";

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
      allowAllOutbound: true,
    });

    // 現在のグローバルIPからのみアクセスを許可
    this.securityGroup.addIngressRule(
      ec2.Peer.ipv4(myIp),
      ec2.Port.allTraffic(),
      "Allow all traffic from my global IP",
    );

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
