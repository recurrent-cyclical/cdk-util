import sns = require('@aws-cdk/aws-sns');
import subs = require('@aws-cdk/aws-sns-subscriptions');
import sqs = require('@aws-cdk/aws-sqs');
import cdk = require('@aws-cdk/core');
import { CfnMapping } from '@aws-cdk/core/lib';
import { IsolatedNetworkSettings, IsolatedVpc } from '../../../src/isolated-vpc';

interface CiVpcProps extends cdk.StackProps {
  accountMaps: CfnMapping['mapping'];
  // isolatedNetworkSettings?: IsolatedNetworkSettings;
}

export class AppStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props: CiVpcProps) {
    super(scope, id, props);

    const defaultParams = ['Environment', 'CostCenterCode', 'MasterStackName'];

    const paramMap = new Map<string, cdk.CfnParameter>();

    defaultParams.forEach(param => {
      const p = new cdk.CfnParameter(this, param, {
        type: 'String',
      });

      paramMap.set(param, p);
    });

    const accountMaps = new CfnMapping(this, 'AccountMaps', {
      mapping: props.accountMaps,
    });

    const vpc = new IsolatedVpc(this, 'MyVpc', {
      // IsolatedNetworkSettings: props.isolatedNetworkSettings,
    });
    
    const queue = new sqs.Queue(this, 'AppQueue', {
      visibilityTimeout: cdk.Duration.seconds(300),
    });

    const topic = new sns.Topic(this, 'AppTopic');

    topic.addSubscription(new subs.SqsSubscription(queue));
  }
}
