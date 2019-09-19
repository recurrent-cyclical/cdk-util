// https://docs.aws.amazon.com/cdk/api/latest/docs/@aws-cdk_aws-ec2.IVpc.html
// https://docs.aws.amazon.com/cdk/api/latest/docs/@aws-cdk_aws-ec2.CfnVPC.html
import ec2 = require('@aws-cdk/aws-ec2');
import {
  CfnFlowLog,
  CfnRouteTable,
  CfnSubnet,
  CfnSubnetRouteTableAssociation,
  CfnVPC,
} from '@aws-cdk/aws-ec2/lib/ec2.generated';
import { defaultSubnetName } from '@aws-cdk/aws-ec2/lib/util';
import { ISubnet, SubnetConfiguration, SubnetSelection, SubnetType, VpcProps } from '@aws-cdk/aws-ec2/lib/vpc';
import route53 = require('@aws-cdk/aws-route53');
import ssm = require('@aws-cdk/aws-ssm');
import cdk = require('@aws-cdk/core');
import { Aws, CfnMapping, Fn } from '@aws-cdk/core/lib';
import vpcBase = require('./vpc-base');

export abstract class IsolatedVpcBase extends vpcBase.VpcBase {
  public getDetaultIsolatedNetworkSettings(): IsolatedNetworkSettings {
    return {
      cidrBlock: '172.16.0.0/24',
      s3Endpoint: true,
      dyanmoEndpoint: false,
      vpcEndpoints: [],
      flowLogBucket: 'arn:aws:s3:::yet-another-log-bucket-${AWS::AccountId}/logs/${MasterStackName}/',
      // @bad-hardcode-value
      hostedZoneName: 'ci.devops.example.com',
      availabiltyZones: [
        { azLetter: 'A', azNumber: 0 },
        { azLetter: 'B', azNumber: 1 },
        { azLetter: 'C', azNumber: 2 },
      ],
      publicIps: false,
      inboundExternalIpRange: '10.0.0.0/8',
      vpcSubnets: [
        {
          // TODO: name = unique
          // { private: { subntets } }
          name: 'Private',
          type: SubnetType.PRIVATE,
          subnets: [
            { cidrBlock: '172.16.0.0/26', az: 'a' },
            { cidrBlock: '172.16.0.65/26', az: 'b' },
            { cidrBlock: '172.16.0.129/26', az: 'c' },
          ],
        },
      ],
    };
  }

  public validateNetworkSettings(settings: IsolatedNetworkSettings): boolean {
    const errors: string[] = [];
    let errorExists: boolean = false;

    // update to check for valid block as type should force existence?

    if (!settings.cidrBlock) {
      errorExists = true;
      errors.push('CIDR Block Error');
    }

    if (errorExists) {
      throw new Error(errors.join('; '));
    }

    // subnet configuration requires unique names

    // azs = one char

    return true;
  }

  public validateProps(props: IsolatedVpcProps): boolean {
    // Can't have enabledDnsHostnames without enableDnsSupport
    if (props.enableDnsHostnames && !props.enableDnsSupport) {
      throw new Error('To use DNS Hostnames, DNS Support must be enabled, however, it was explicitly disabled.');
    }

    return true;
  }
}

export interface IsolatedAvailabiltyZone {
  azLetter: 'A' | 'B' | 'C' | 'D' | 'E' | 'F'; // future = generate // should be char A..Z
  azNumber: number;
}

export interface IsolatedNetworkSettings {
  cidrBlock: string;
  availabiltyZones: IsolatedAvailabiltyZone[];
  flowLogBucket: string;
  publicIps: boolean;
  inboundExternalIpRange: string;
  vpcSubnets: IsolatedVpcSubnetConfiguration[];
  s3Endpoint?: boolean;
  dyanmoEndpoint: boolean;
  vpcEndpoints: string[];
  hostedZoneName?: string;
}

export interface IsolatedVpcSubnetConfiguration {
  name: string;
  type: SubnetType.PRIVATE | SubnetType.ISOLATED;
  subnets: IsolatedSubnetConfig[];
}

export interface IsolatedSubnetConfig {
  cidrBlock: string; // 10.0.0.1/24
  az: string; // A?
}

export interface IsolatedVpcProps extends VpcProps {
  isolatedNetworkSettings?: IsolatedNetworkSettings;
}

class MySubnet extends ec2.PrivateSubnet {}

export class IsolatedVpc extends IsolatedVpcBase {
  // Class B and Crazy Small
  public static readonly DEFAULT_CIDR_RANGE: string = '172.16.0.0/24';
  // public static readonly DEFAULT_NETWORK_SETTINGS: IsolatedNetworkSettings;
  private static readonly enableDnsHostnames = true;
  private static readonly enableDnsSupport = true;

  /**
   * Identifier for this VPC
   */
  public readonly vpcId: string;

  /**
   * @attribute
   */
  public readonly vpcCidrBlock: string;

  /**
   * @attribute
   */
  public readonly vpcDefaultNetworkAcl: string;

  /**
   * @attribute
   */
  public readonly vpcCidrBlockAssociations: string[];

  /**
   * @attribute
   */
  public readonly vpcDefaultSecurityGroup: string;

  /**
   * @attribute
   */
  public readonly vpcIpv6CidrBlocks: string[];

  /**
   * List of public subnets in this VPC
   */
  public readonly publicSubnets: ISubnet[] = [];

  /**
   * List of private subnets in this VPC
   */
  public readonly privateSubnets: ISubnet[] = [];

  /**
   * List of isolated subnets in this VPC
   */
  public readonly isolatedSubnets: ISubnet[] = [];

  /**
   * AZs for this VPC
   */
  public readonly availabilityZones: string[];

  /**
   * Identifier for the VPN gateway
   */
  public readonly vpnGatewayId?: string;

  public readonly internetConnectivityEstablished: cdk.IDependable;

  private readonly cfnVpc: CfnVPC;

  constructor(scope: cdk.Construct, id: string, props: IsolatedVpcProps = {}) {
    super(scope, id);

    this.validateProps(props);

    const stack = cdk.Stack.of(this);

    const isolatedNetworkSettings =
      props.isolatedNetworkSettings == null ? this.getDetaultIsolatedNetworkSettings() : props.isolatedNetworkSettings;
    this.validateNetworkSettings(isolatedNetworkSettings);

    const enableDnsHostnames = props.enableDnsHostnames == null ? true : props.enableDnsHostnames;
    const enableDnsSupport = props.enableDnsSupport == null ? true : props.enableDnsSupport;
    const instanceTenancy = props.defaultInstanceTenancy || 'default';
    const cidrBlock = isolatedNetworkSettings.cidrBlock;

    // new cdk.Fn.join()
    this.cfnVpc = new CfnVPC(this, 'Resource', {
      cidrBlock,
      enableDnsHostnames,
      enableDnsSupport,
      instanceTenancy,
      // tags
    });

    // vpcId: string;
    // publicSubnets: ISubnet[];
    // privateSubnets: ISubnet[];
    // isolatedSubnets: ISubnet[];
    // availabilityZones: string[];
    // vpnGatewayId?: string | undefined;
    // internetConnectivityEstablished: cdk.IDependable;
    // vpc: ec2.CfnVPC;
    // stack: cdk.Stack;
    // node: cdk.ConstructNode;

    this.vpcDefaultNetworkAcl = this.cfnVpc.attrDefaultNetworkAcl;
    this.vpcCidrBlockAssociations = this.cfnVpc.attrCidrBlockAssociations;
    this.vpcCidrBlock = this.cfnVpc.attrCidrBlock;
    this.vpcDefaultSecurityGroup = this.cfnVpc.attrDefaultSecurityGroup;
    this.vpcIpv6CidrBlocks = this.cfnVpc.attrIpv6CidrBlocks;

    this.node.applyAspect(new cdk.Tag('Name', this.node.path));

    // TODO: add extra CIDRS

    this.vpcId = this.cfnVpc.ref;

    const vpcOutput = new cdk.CfnOutput(this, 'VpcOutput', {
      value: this.vpcId,
      exportName: Fn.sub('${MasterStackName}-Vpc'),
    });

    const vpcCidrOutput = new cdk.CfnOutput(this, 'VpcCidrOutput', {
      value: isolatedNetworkSettings.cidrBlock,
      exportName: Fn.sub('${MasterStackName}-Vpc-Cidr'),
    });

    const flowLog = new CfnFlowLog(this, 'FlowLog', {
      // deliverLogsPermissionArn = ,
      // If you specify LogDestinationType as s3, do not specify DeliverLogsPermissionArn or LogGroupName.
      logDestinationType: 's3',
      logDestination: Fn.sub(isolatedNetworkSettings.flowLogBucket),
      resourceId: this.vpcId,
      resourceType: 'VPC',
      trafficType: 'ALL',
    });

    // TODO: tags
    const routeTable = new CfnRouteTable(this, 'RouteTable', {
      vpcId: this.vpcId,
    });

    if (isolatedNetworkSettings.s3Endpoint) {
      const s3Endpoint = new ec2.CfnVPCEndpoint(this, 's3Endpoint', {
        serviceName: Fn.sub('com.amazonaws.${AWS::Region}.s3'),
        policyDocument: {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: '*',
              Action: ['s3:*'],
              Resource: ['arn:aws:s3:::*'],
            },
          ],
        },
        routeTableIds: [routeTable.ref],
        vpcId: this.vpcId,
      });
    }

    // const actualVpc = this.vpcId;

    if (isolatedNetworkSettings.hostedZoneName) {
      const privateZone = new route53.CfnHostedZone(this, 'PrivateZone', {
        name: isolatedNetworkSettings.hostedZoneName,
        // hostedZoneTags
        // hostedZoneConfig
        // vpcs: [cdk.Lazy.anyValue({produce(){ return actualVpc}})]
        vpcs: [
          {
            vpcId: this.vpcId,
            vpcRegion: stack.region,
          },
        ],
      });

      const dhcpOptions = new ec2.CfnDHCPOptions(this, 'DhcpOptions', {
        domainName: isolatedNetworkSettings.hostedZoneName,
        // The default DHCP option set specifies AmazonProvidedDNS
      });

      const vpcDhcpOptionsAssociation = new ec2.CfnVPCDHCPOptionsAssociation(this, 'VpcDhcpOptionsAssociation', {
        vpcId: this.vpcId,
        dhcpOptionsId: dhcpOptions.ref,
      });
    }

    // TODO: move to function

    const subnetConfigurations: IsolatedVpcSubnetConfiguration[] = isolatedNetworkSettings.vpcSubnets;

    for (const subnetConfiguration of subnetConfigurations) {
      const subnetList: string[] = [];
      for (const vpcSubnet of subnetConfiguration.subnets) {
        const subnetName = 'Subnet' + subnetConfiguration.name + vpcSubnet.az;
        const az = '${AWS::Region}' + vpcSubnet.az;
        const subnet = new CfnSubnet(this, subnetName, {
          vpcId: this.vpcId,
          cidrBlock: vpcSubnet.cidrBlock,
          availabilityZone: Fn.sub(az),
          mapPublicIpOnLaunch: false,
        });

        const ps = ec2.PrivateSubnet.fromPrivateSubnetAttributes(this, 'Private' + subnetName, {
          availabilityZone: az,
          subnetId: subnet.ref,
          routeTableId: routeTable.ref,
        });
        this.privateSubnets.push(ps);
        // subnetList.push(ps);

        // const privateSubnet = new ec2.PrivateSubnet(this, subnetName + 'x', {
        //     availabilityZone: Fn.sub(az),
        //     vpcId: this.vpcId,
        //     cidrBlock: vpcSubnet.cidrBlock,
        //     mapPublicIpOnLaunch: false,
        // })
        // this.privateSubnets.push(privateSubnet);
        subnetList.push(subnet.ref);

        // TODO add tags
        // subnet.node.applyAspect(new Tag(SUBNETNAME_TAG, subnetConfig.name, {includeResourceTypes}));

        const cfnSubnetRouteTableAssociation = new CfnSubnetRouteTableAssociation(
          this,
          'SubnetAssoc' + subnetConfiguration.name + vpcSubnet.az,
          {
            subnetId: subnet.ref,
            routeTableId: routeTable.ref,
          },
        );

        const baseTldZoneOutput = new cdk.CfnOutput(this, 'SubnetOutput' + subnetConfiguration.name + vpcSubnet.az, {
          value: subnet.ref,
          exportName: Fn.sub('${MasterStackName}-Subnet-' + subnetConfiguration.name + vpcSubnet.az),
        });
        // TODO add output?

        // const param = new ssm.StringParameter(stack, 'StringParameter', {
        //     // description: 'Some user-friendly description',
        //     // name: 'ParameterName',
        //     stringValue: 'Initial parameter value',
        //     // allowedPattern: '.*',
        // });
      }
      // new cdk.CfnOutput(this, 'Private Subnet Output', {
      //     value: Fn.join(',', this.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE }).subnetIds)
      // });
      const subnetOutput = new cdk.CfnOutput(this, subnetConfiguration.name, {
        value: Fn.join(',', subnetList),
        exportName: Fn.sub('${MasterStackName}-' + subnetConfiguration.name + '-SubnetList'),
      });
      const paramList = new ssm.StringListParameter(stack, subnetConfiguration.name + 'StringListParameter', {
        // description: 'Some user-friendly description',
        // name: 'ParameterName',
        parameterName: Fn.sub('/output/${MasterStackName}/' + subnetConfiguration.name + 'SubnetList'),
        stringListValue: subnetList,
        // allowedPattern: '.*',
      });
      const param = new ssm.StringParameter(stack, subnetConfiguration.name + 'StringParameter', {
        // description: 'Some user-friendly description',
        parameterName: Fn.sub('/output/${MasterStackName}/' + subnetConfiguration.name + 'Subnets'),
        stringValue: Fn.join(',', subnetList),
        // allowedPattern: '.*',
      });
    }
  }

  protected selectSubnetObjects(selection: SubnetSelection = {}): ISubnet[] {
    console.log('do validation here');
    // raise error on public || swap public with 'public'?
    return super.selectSubnetObjects(selection);
  }

  // TODO: create Subnet exports and param store values for subnet[]
}
