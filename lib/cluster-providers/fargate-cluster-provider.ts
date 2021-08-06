import { Construct } from "@aws-cdk/core";
import { IVpc } from "@aws-cdk/aws-ec2";
import * as eks from "@aws-cdk/aws-eks";

import { ClusterInfo, ClusterProvider } from "..";

export class FargateClusterProvider implements ClusterProvider {

    readonly profiles: Map<string, eks.FargateProfileOptions>;

    clusterOptions?: eks.CommonClusterOptions; //TODO: integrate into cluster creation

    constructor(inProfiles?: Map<string, eks.FargateProfileOptions>, clusterOptions?: eks.CommonClusterOptions) {
        this.profiles = inProfiles ?? new Map<string, eks.FargateProfileOptions>();
        this.clusterOptions = clusterOptions;
    }

    createCluster(scope: Construct, vpc: IVpc, version: eks.KubernetesVersion): ClusterInfo {

        // TODO: fix configuration so that it does not always come from context but could be injected
        const vpcSubnets = scope.node.tryGetContext("vpcSubnets");

        const id = scope.node.id;

        const cluster = new eks.FargateCluster(scope, id, {
            vpc: vpc,
            clusterName: id,
            outputClusterName: true,
            version: version,
            vpcSubnets: vpcSubnets,

        });

        for (const [id, options] of this.profiles) {
            cluster.addFargateProfile(id, options);
        }

        return { cluster: cluster, version: version };
    }

}