import { ClusterAddOn, ClusterInfo } from "../../spi";

/**
 * Configuration options for the add-on.
 */
export interface OpaGatekeeperAddOnProps {

    /**
     * Namespace where OPA Gatekeeper will be installed
     * @default kube-system
     */
    namespace?: string;

    /**
     * Helm chart version to use to install.
     * @default 3.6.0-beta.3
     */
    chartVersion?: string;

    /**
     * Values for the Helm chart.
     */
    values?: any;
}

/**
 * Defaults options for the add-on
 */
const defaultProps: OpaGatekeeperAddOnProps = {
    namespace: 'kube-system',
    chartVersion: '3.6.0-beta.3',
};

export class OpaGatekeeperAddOn implements OpaGatekeeperAddOn {

    private options: OpaGatekeeperAddOnProps;

    constructor(props?: OpaGatekeeperAddOnProps) {
        this.options = { ...defaultProps, ...props };
    }


    deploy(clusterInfo: ClusterInfo): void {

        clusterInfo.cluster.addHelmChart("opagatekeeper-addon", {
            chart: "gatekeeper",
            release: "gatekeeper",
            repository: "https://open-policy-agent.github.io/gatekeeper/charts",
            version: "3.6.0-beta.3",
            namespace: "kube-system"
        });
    }
}