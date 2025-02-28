#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { DwhStackStack } from "../lib/dwh_stack-stack";
import { IConstruct } from "constructs";
import { DataLakeInfrastructureStack } from "../lib/datalakeinfrastracture-stack";

const app = new cdk.App();
new DwhStackStack(app, "DwhStackStack", {
  /* If you don't specify 'env', this stack will be environment-agnostic.
   * Account/Region-dependent features and context lookups will not work,
   * but a single synthesized template can be deployed anywhere. */

  /* Uncomment the next line to specialize this stack for the AWS Account
   * and Region that are implied by the current CLI configuration. */
  // env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },

  /* Uncomment the next line if you know exactly what Account and Region you
   * want to deploy the stack to. */
  env: { account: "550809302734", region: "us-east-1" },

  /* For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html */
});
new DataLakeInfrastructureStack(app, "DataLakeInfrastructureStack", {
  env: { account: "550809302734", region: "us-east-1" },
});
cdk.Tags.of(app).add("Owner", "Sou.Tokuda@sony.com");
/**
 * 指定された構造物に削除ポリシーを適用し、すべての子構造物にも再帰的に適用します。
 * @param construct - 削除ポリシーを適用する構造物
 * @param removalPolicy - 適用する削除ポリシー
 */
function applyRemovalPolicyToAll(
  construct: IConstruct,
  removalPolicy: cdk.RemovalPolicy,
): void {
  if (construct instanceof cdk.CfnResource) {
    construct.applyRemovalPolicy(removalPolicy);
  }

  construct.node.children.forEach((child) => {
    applyRemovalPolicyToAll(child, removalPolicy);
  });
}
// ispsysのアカウントでは作成したリソースは完全削除できるようにする。
applyRemovalPolicyToAll(app, cdk.RemovalPolicy.DESTROY);
