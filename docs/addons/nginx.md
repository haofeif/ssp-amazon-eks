# NGINX Add-on

This add-on installs [NGINX Ingress Controller](https://kubernetes.github.io/ingress-nginx/deploy/) on Amazon EKS. NGINX ingress controller is using [NGINX](https://www.nginx.org/) as a reverse proxy and load balancer. 

Other than handling Kubernetes ingress objects, this ingress controller can facilitate multi-tenancy and segregation of workload ingresses based on host name (host-based routing) and/or URL Path (path based routing). 

This add-on depends on [AWS Load Balancer Controller](aws-load-balancer-controller.md) in order to enable NLB support. 

## Usage

```typescript
import { NginxAddOn, ClusterAddOn, EksBlueprint }  from '@aws-quickstart/ssp-amazon-eks';

const externalDnsHostname  = ...;
const addOn = new NginxAddOn({ externalDnsHostname });
const addOns: Array<ClusterAddOn> = [ addOn ];

const app = new cdk.App();
new EksBlueprint(app, 'my-stack-name', addOns, [], {
  env: {    
      account: <AWS_ACCOUNT_ID>,
      region: <AWS_REGION>,
  },
});
```

To validate that installation is successful run the following command:

```bash
$ kubectl get po -n kube-system
NAME                                                              READY   STATUS    RESTARTS   AGE
ssp-addon-nginx-ingress-78b8567p4q6   1/1     Running   0          4d10h
```

Note that the ingress controller is deployed in the `kube-system` namespace.

Once deployed, it allows applications to create ingress objects and use host based routing with external DNS support, if External DNS Add-on is installed.

## Configuration

 - `backendProtocol`: indication for AWS Load Balancer controller with respect to the protocol supported on the load balancer. TCP by default.
 - `crossZoneEnabled`: whether to create a cross-zone load balancer with the service that backs NGINX.
 - `internetFacing`: whether the created load balancer is internet facing. Defaults to `true` if not specified. Internal load balancer is provisioned if set to `false`
 -  `targetType`: `IP` or `instance` mode. Defaults to `IP` which requires VPC-CNI and has better performance eliminating a hop through kubeproxy. Instance mode leverages traditional NodePort mode on the instances. 
 - `externaDnsHostname`: Used in conjunction with the [external DNS add-on](./external-dns.md) to handle automatic registration of the service with Route53. 
 - `values`: Arbitrary values to pass to the chart as per https://docs.nginx.com/nginx-ingress-controller/installation/installation-with-helm/#

## DNS Integration and Routing

If [External DNS Add-on](../addons/external-dns.md) is installed, it is possible to configure NGINX ingress with an external NLB load balancer and leverage wild-card DNS domains (and public certificate) to route external traffic to individual workloads. 

The following example provides support for AWS Load Balancer controller, External DNS and NGINX add-ons to enable such routing:

```typescript
ssp.EksBlueprint.builder()
    //  Register hosted zone1 under the name of MyHostedZone1
    .resourceProvider("MyHostedZone1",  new ssp.DelegatingHostedZoneProvider({
        parentDomain: 'myglobal-domain.com',
        subdomain: 'dev.myglobal-domain.com', 
        parentAccountId: parentDnsAccountId,
        delegatingRoleName: 'DomainOperatorRole',
        wildcardSubdomain: true
    })
    .addOns(new ssp.addons.ExternalDnsAddon({
        hostedZoneProviders: ["MyHostedZone1"];
    })
    .addOns(new ssp.NginxAddOn({ internetFacing: true, backendProtocol: "tcp", externaDnsHostname: subdomain, crossZoneEnabled: false })
    .build(...);
```

Assuming the subdomain in the above example is `dev.my-domain.com` and wildcard is enabled for the external DNS add-on customers can now create ingress objects for host-based routing. Let's define an ingress object for `team-riker` that is currently deploying guestbook application with no ingress:

```yaml
apiVersion: extensions/v1beta1
kind: Ingress
metadata:
  annotations:
    kubernetes.io/ingress.class: nginx
  name: ingress-riker
  namespace: team-riker
spec:
  rules:
  - host: riker.dev.my-domain.com
    http:
      paths:
      - backend:
          serviceName: guestbook-ui
          servicePort: 80
        path: /
        pathType: Prefix
```

A similar ingress may be defined for `team-troi` routing to the workloads deployed by that team:

```yaml
apiVersion: extensions/v1beta1
kind: Ingress
metadata:
  annotations:
    kubernetes.io/ingress.class: nginx
  name: ingress-troi
  namespace: team-troi
spec:
  rules:
  - host: troi.dev.my-domain.com
    http:
      paths:
      - backend:
          serviceName: guestbook-ui
          servicePort: 80
        path: /
        pathType: Prefix
```

After the above ingresses applied (ideally through a GitOps engine) you can now navigate to the specified hosts respectively:

[http://riker.dev.my-domain.com](http://riker.dev.my-domain.com)
[http://troi.dev.my-domain.com](http://troi.dev.my-domain.com)

## TLS Termination and Certificates

You can configure the NGINX add-on to terminate TLS at the load balancer and supply an ACM certificate through the platform blueprint.

A certificate can be registered using a named [resource provider](../resource-providers/index.md).

For convenience the framework provides a couple of common certificate providers:

**Import Certificate**

This case is used when certificate is already created and you just need to reference it with the blueprint stack:

```typescript
const myCertArn = "";
ssp.EksBlueprint.builder()
    .resourceProvider(GlobalResources.Certificate, new ImportCertificateProvider(myCertArn, "cert1-id"))
    .addOns(new NginxAddOn({
        certificateResourceName: GlobalResources.Certificate,
        externalDnsHostname: 'my.domain.com'
    }))
    .teams(...)
    .build(app, 'stack-with-cert-provider');
```

**Create Certificate**

This approach is used when certificate should be created with the blueprint stack. In this case, the new certificate requires DNS validation which can be accomplished automatically if the corresponding Route53 hosted zone is provisioned (either along with the stack or separately) and registered as a resource provider.

```typescript
ssp.EksBlueprint.builder()
    .resourceProvider(GlobalResources.HostedZone ,new ImportHostedZoneProvider('hosted-zone-id1', 'my.domain.com'))
    .resourceProvider(GlobalResources.Certificate, new CreateCertificateProvider('domain-wildcard-cert', '*.my.domain.com', GlobalResources.HostedZone)) // referencing hosted zone for automatic DNS validation
    .addOns(new AwsLoadBalancerControllerAddOn())
    // Use hosted zone for External DNS
    .addOns(new ExternalDnsAddon({hostedZoneResources: [GlobalResources.HostedZone]}))
    // Use certificate registered before with NginxAddon
    .addOns(new NginxAddOn({
        certificateResourceName: GlobalResources.Certificate,
        externalDnsHostname: 'my.domain.com'
    }))
    .teams(...)
    .build(app, 'stack-with-resource-providers');
```
## Functionality

1. Installs NGINX ingress controller
2. Provides convenience options to integrate with AWS Load Balancer controller to leverage NLB for the load balancer
3. Provides convenience options to integrate with External DNS add-on for integration with Amazon Route 53. 
4. Allows configuring TLS termination at the load balancer provisioned with the add-on. 