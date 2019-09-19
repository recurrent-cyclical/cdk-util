// https://docs.aws.amazon.com/cdk/api/latest/docs/@aws-cdk_aws-ec2.IVpc.html
// https://docs.aws.amazon.com/cdk/api/latest/docs/@aws-cdk_aws-ec2.CfnVPC.html
import ec2 = require('@aws-cdk/aws-ec2');
import {
  CfnRouteTable,
  CfnSubnet,
  CfnSubnetRouteTableAssociation,
  CfnVPC,
  CfnVPCGatewayAttachment,
} from '@aws-cdk/aws-ec2/lib/ec2.generated';
import {
  allRouteTableIds,
  defaultSubnetName,
  ImportSubnetGroup,
  subnetId,
  subnetName,
} from '@aws-cdk/aws-ec2/lib/util';
import vpc = require('@aws-cdk/aws-ec2/lib/vpc');
import {
  ISubnet,
  IVpc,
  SelectedSubnets,
  SubnetConfiguration,
  SubnetSelection,
  SubnetType,
  VpcProps,
} from '@aws-cdk/aws-ec2/lib/vpc';
import {
  GatewayVpcEndpoint,
  GatewayVpcEndpointAwsService,
  GatewayVpcEndpointOptions,
  InterfaceVpcEndpoint,
  InterfaceVpcEndpointOptions,
} from '@aws-cdk/aws-ec2/lib/vpc-endpoint';
import { VpnConnection, VpnConnectionOptions, VpnConnectionType } from '@aws-cdk/aws-ec2/lib/vpn';
import cdk = require('@aws-cdk/core');
import { Aws, CfnMapping, Fn } from '@aws-cdk/core/lib';

// abstract class VpcBase extends Resource implements IVpc

interface LocalStackProps extends cdk.StackProps {
  accountMaps: CfnMapping['mapping'];
}

// Question: raise error on any attempts to fine public subnets?

// Would be easier if VpcBase was exported
// The followins is based and copied from https://github.com/aws/aws-cdk/blob/master/packages/%40aws-cdk/aws-ec2/lib/vpc.ts

// @https://github.com/aws/aws-cdk/blob/master/packages/%40aws-cdk/aws-ec2/lib/vpc.ts
function describeSelection(placement: SubnetSelection): string {
  if (placement.subnetType !== undefined) {
    return `'${defaultSubnetName(placement.subnetType)}' subnets`;
  }
  if (placement.subnetName !== undefined) {
    return `subnets named '${placement.subnetName}'`;
  }
  return JSON.stringify(placement);
}

/**
 * If the placement strategy is completely "default", reify the defaults so
 * consuming code doesn't have to reimplement the same analysis every time.
 *
 * Returns "private subnets" by default.
 */
// @https://github.com/aws/aws-cdk/blob/master/packages/%40aws-cdk/aws-ec2/lib/vpc.ts
function reifySelectionDefaults(placement: SubnetSelection): SubnetSelection {
  if (placement.subnetType !== undefined && placement.subnetName !== undefined) {
    throw new Error('Only one of subnetType and subnetName can be supplied');
  }

  if (placement.subnetType === undefined && placement.subnetName === undefined) {
    return { subnetType: SubnetType.PRIVATE, onePerAz: placement.onePerAz };
  }

  return placement;
}

// @https://github.com/aws/aws-cdk/blob/master/packages/%40aws-cdk/aws-ec2/lib/vpc.ts
class CompositeDependable implements cdk.IDependable {
  private readonly dependables = new Array<cdk.IDependable>();

  constructor() {
    const self = this;
    cdk.DependableTrait.implement(this, {
      get dependencyRoots() {
        const ret = [];
        for (const dep of self.dependables) {
          ret.push(...cdk.DependableTrait.get(dep).dependencyRoots);
        }
        return ret;
      },
    });
  }

  /**
   * Add a construct to the dependency roots
   */
  public add(dep: cdk.IDependable) {
    this.dependables.push(dep);
  }
}

/**
 * Invoke a function on a value (for its side effect) and return the value
 */
// @https://github.com/aws/aws-cdk/blob/master/packages/%40aws-cdk/aws-ec2/lib/vpc.ts
function tap<T>(x: T, fn: (x: T) => void): T {
  fn(x);
  return x;
}

export abstract class VpcBase extends cdk.Resource implements IVpc {
  public vpcId: string;
  public publicSubnets: ISubnet[];
  public privateSubnets: ISubnet[];
  public isolatedSubnets: ISubnet[];
  public availabilityZones: string[];
  public vpnGatewayId?: string | undefined;
  public internetConnectivityEstablished: cdk.IDependable;
  public vpc: ec2.CfnVPC;
  public stack: cdk.Stack;
  public node: cdk.ConstructNode;

  public selectSubnets(selection?: SubnetSelection | undefined): SelectedSubnets {
    const subnets = this.selectSubnetObjects(selection);
    const pubs = new Set(this.publicSubnets);
    // TODO:
    return {
      availabilityZones: subnets.map(s => s.availabilityZone),
      hasPublic: subnets.some(s => pubs.has(s)),
      internetConnectivityEstablished: tap(new CompositeDependable(), d =>
        subnets.forEach(s => d.add(s.internetConnectivityEstablished)),
      ),
      subnets,
      subnetIds: subnets.map(s => s.subnetId),
    };
    throw new Error('Method not implemented.');
  }

  /**
   * Adds a new VPN connection to this VPC
   */
  // @https://github.com/aws/aws-cdk/blob/master/packages/%40aws-cdk/aws-ec2/lib/vpc.ts
  public addVpnConnection(id: string, options: VpnConnectionOptions): VpnConnection {
    return new VpnConnection(this, id, {
      vpc: this,
      ...options,
    });
  }

  /**
   * Adds a new gateway endpoint to this VPC
   */
  // @https://github.com/aws/aws-cdk/blob/master/packages/%40aws-cdk/aws-ec2/lib/vpc.ts
  public addGatewayEndpoint(id: string, options: ec2.GatewayVpcEndpointOptions): ec2.GatewayVpcEndpoint {
    return new GatewayVpcEndpoint(this, id, {
      vpc: this,
      ...options,
    });
  }

  /**
   * Adds a new interface endpoint to this VPC
   */
  // @https://github.com/aws/aws-cdk/blob/master/packages/%40aws-cdk/aws-ec2/lib/vpc.ts
  public addInterfaceEndpoint(id: string, options: ec2.InterfaceVpcEndpointOptions): ec2.InterfaceVpcEndpoint {
    return new InterfaceVpcEndpoint(this, id, {
      vpc: this,
      ...options,
    });
  }

  /**
   * Return the subnets appropriate for the placement strategy
   */
  // @https://github.com/aws/aws-cdk/blob/master/packages/%40aws-cdk/aws-ec2/lib/vpc.ts
  protected selectSubnetObjects(selection: SubnetSelection = {}): ISubnet[] {
    selection = reifySelectionDefaults(selection);
    let subnets: ISubnet[] = [];

    if (selection.subnetName !== undefined) {
      // Select by name
      const allSubnets = [...this.publicSubnets, ...this.privateSubnets, ...this.isolatedSubnets];
      subnets = allSubnets.filter(s => subnetName(s) === selection.subnetName);
    } else {
      // Select by type
      subnets = {
        [SubnetType.ISOLATED]: this.isolatedSubnets,
        [SubnetType.PRIVATE]: this.privateSubnets,
        [SubnetType.PUBLIC]: this.publicSubnets,
      }[selection.subnetType || SubnetType.PRIVATE];

      if (selection.onePerAz && subnets.length > 0) {
        // Restrict to at most one subnet group
        subnets = subnets.filter(s => subnetName(s) === subnetName(subnets[0]));
      }
    }

    if (subnets.length === 0) {
      throw new Error(
        `There are no ${describeSelection(selection)} in this VPC. Use a different VPC subnet selection.`,
      );
    }

    return subnets;
  }
}
