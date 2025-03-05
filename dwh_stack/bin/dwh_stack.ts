#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { MyStack } from '../lib/dwh_stack-stack';
import { IConstruct } from 'constructs';

const app = new cdk.App();

// 環境変数から環境名を取得（デフォルトはdev）
const envName = process.env.CDK_ENV || 'dev';

new MyStack(app, `MinimalCost-${envName}-Stack`, {
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: process.env.CDK_DEFAULT_REGION || 'ap-northeast-1'
  },
  description: `最小コストで構築されたインフラストラクチャ (${envName}環境)`,
});
cdk.Tags.of(app).add("Owner","Sou.Tokuda@sony.com")


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

  construct.node.children.forEach((child:IConstruct) => {
    applyRemovalPolicyToAll(child, removalPolicy);
  });
}

// ispsysのアカウントでは作成したリソースは完全削除できるようにする。
applyRemovalPolicyToAll(app, cdk.RemovalPolicy.DESTROY);

app.synth();
