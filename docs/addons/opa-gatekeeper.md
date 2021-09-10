# What is OPA?

The Open Policy Agent (OPA, pronounced “oh-pa”) is an open source, general-purpose policy engine that unifies policy enforcement across the stack. OPA provides a high-level declarative language that lets you specify policy as code and simple APIs to offload policy decision-making from your software. You can use OPA to enforce policies in microservices, Kubernetes, CI/CD pipelines, API gateways, and more. OPA uses a policy language known as Rego which is a query language which was purpose built to support structured document models such as JSON. To learn more about Rego check out this [link](https://www.openpolicyagent.org/docs/latest/policy-language/).

OPA Gatekeeper is an open-source project that provides a first-class integration between OPA and Kubernetes. What Gatekeeper adds is an extensible parameterized policy library that includes native Kubernetes CRD's for instantiating and extending the OPA policy library. Gatekeeper also provides audit functionality as well. 

## How is Gatekeeper different than OPA?

Compared to using OPA with its sidecar kube-mgmt (aka Gatekeeper v1.0), Gatekeeper introduces the following functionality:

- An extensible, parameterized policy library
- Native Kubernetes CRDs for instantiating the policy library (aka "constraints")
- Native Kubernetes CRDs for extending the policy library (aka "constraint templates")
- Audit functionality

The diagram below shows how Gatekeeper interacts with the Kube API Server

![opa](https://d33wubrfki0l68.cloudfront.net/a5ed0c27ff2dda6abb18b9bc960f2ad4120d937a/a5939/docs/latest/images/kubernetes-admission-flow.png)

The Kubernetes API Server is configured to query OPA for admission control decisions when objects (e.g., Pods, Services, etc.) are created, updated, or deleted. The API Server sends the entire Kubernetes object in the webhook request to OPA. OPA evaluates the policies it has loaded using the admission review as input. The diagram below shows the flow between a user making a request to the Kube-API server and how AdmissionReview and AdmissionRequests are made through OPA Gatekeeper.

## Policies and Constraints

Gatekeeper uses the OPA Constraint framework to define and enforce policies. A Constraint is a declaration that its author wants a system to meet a given set of requirements. Each Constraint is written with Rego, a declarative query language used by OPA to enumerate instances of data that violate the expected state of the system. All Constraints are evaluated as a logical AND. If one Constraint is not satisfied, then the whole request is rejected.

Before defining a Constraint, you need to create a Constraint Template that allows people to declare new Constraints. Each template describes both the Rego logic that enforces the Constraint and the schema for the Constraint, which includes the schema of the CRD and the parameters that can be passed into a Constraint, much like arguments to a function.

For example, here is a Constraint template CRD that requires certain labels to be present on an arbitrary object.

```yaml
apiVersion: templates.gatekeeper.sh/v1beta1
kind: ConstraintTemplate
metadata:
 name: k8srequiredlabels
spec:
 crd:
 spec:
 names:
 kind: K8sRequiredLabels
 listKind: K8sRequiredLabelsList
 plural: k8srequiredlabels
 singular: k8srequiredlabels
 validation:
 # Schema for the `parameters` field
 openAPIV3Schema:
 properties:
 labels:
 type: array
 items: string
 targets:
 - target: admission.k8s.gatekeeper.sh
 rego: |
 package k8srequiredlabels

 deny[{"msg": msg, "details": {"missing_labels": missing}}] {
 provided := {label | input.review.object.metadata.labels[label]}
 required := {label | label := input.parameters.labels[_]}
 missing := required - provided
 count(missing) > 0
 msg := sprintf("you must provide labels: %v", [missing])
 }
```

Once a Constraint template has been deployed in the cluster, an admin can now create individual Constraint CRDs as defined by the Constraint template. For example, here is a Constraint CRD that requires the label hr to be present on all namespaces.

```yaml
apiVersion: constraints.gatekeeper.sh/v1beta1
kind: K8sRequiredLabels
metadata:
 name: ns-must-have-hr
spec:
 match:
 kinds:
 - apiGroups: [""]
 kinds: ["Namespace"]
 parameters:
 labels: ["hr"]
```

Similarly, another Constraint CRD that requires the label finance to be present on all namespaces can easily be created from the same Constraint template.

```yaml
apiVersion: constraints.gatekeeper.sh/v1beta1
kind: K8sRequiredLabels
metadata:
 name: ns-must-have-finance
spec:
 match:
 kinds:
 - apiGroups: [""]
 kinds: ["Namespace"]
 parameters:
 labels: ["finance"]
```
As you can see, with the Constraint framework, we can reliably share Regos via the Constraint templates, define the scope of enforcement with the match field, and provide user-defined parameters to the Constraints to create customized behavior for each Constraint.


## OPA Gatekeeper and SSP

In the context of a Shared Services Platform running on Amazon EKS, platform teams and administrators need a way of being able to set policies to adhere to governance and security requirements for all workloads and teams working on the same cluster. Examples of standard use cases for using policies via OPA Gatekeeper are shown below:

- Which users can access which resources.
- Which subnets egress traffic is allowed to.
- Which clusters a workload must be deployed to.
- Which registries binaries can be downloaded from.
- Which OS capabilities a container can execute with.
- Which times of day the system can be accessed at.


## Getting Started with OPA Gatekeeper

For the purposes of operating within a Shared Services Platform, we will be focusing on how to use a policy driven approach to secure our cluster using OPA Gatekeeper. You will see a directory with a set of example policies you can use to get started which can be found [here](https://github.com/open-policy-agent/gatekeeper-library/tree/master/library/general). Since the SSP comes with OPA Gatekeeper installed via Helm, you can simply navigate to the examples directory and choose the policies you wish to apply to your cluster. 

In this example, the cluster admin will force the use of unprivileged containers in the cluseter. The OPA Gatekeeper will look for the securitycontext field and check if privileged=true. If it’s the case, then, the request will fail. The policy should look like the following: 

```bash
cat > /tmp/constrainttemplate.yaml <<EOF
apiVersion: templates.gatekeeper.sh/v1beta1
kind: ConstraintTemplate
metadata:
  name: k8spspprivilegedcontainer
spec:
  crd:
    spec:
      names:
        kind: K8sPSPPrivilegedContainer
  targets:
    - target: admission.k8s.gatekeeper.sh
      rego: |
        package k8spspprivileged

        violation[{"msg": msg, "details": {}}] {
            c := input_containers[_]
            c.securityContext.privileged
            msg := sprintf("Privileged container is not allowed: %v, securityContext: %v", [c.name, c.securityContext])
        }

        input_containers[c] {
            c := input.review.object.spec.containers[_]
        }

        input_containers[c] {
            c := input.review.object.spec.initContainers[_]
        }
EOF
```

Create the policy by running the following command:

```bash
kubectl create -f /tmp/constrainttemplate.yaml
```

Check to see that the new pod was created by running the following command:


```bash
kubectl get pods
``` 

we should see a similar output:

```bash
NAME                  READY   STATUS    RESTARTS   AGE
opa-allowed           1/1     Running   0          76s
```

If we inspect the pods and look at the containers.spec section of the pod we see the following:

```yaml
Containers:
  opa:
    Container ID:  docker://1b2da3c7d7c41becac49613ed7db863c7b1365137bbfe1b108220d4ffba188b3
    Image:         openpolicyagent/opa:0.9.2
    Image ID:      docker-pullable://openpolicyagent/opa@sha256:04ff8fce2afd1a3bc26260348e5b290e8d945b1fad4b4c16d22834c2f3a1814a
    Port:          <none>
    Host Port:     <none>
    Args:
      run
      --server
      --addr=localhost:8080
```

This is exactly what is defined in our example_allowed.yaml file so we know that our policy was deployed successfully using OPA Gatekeeper. For more information on OPA Gatekeeper policies, check out the GitHub repo which can be found [here](https://github.com/open-policy-agent/gatekeeper-library)

We will then need to use the constraint to inform the OPA Gatekeeper to enforce the policy. For our example, as cluster admin we want to enforce that all the created pod should not be privileged. Run the following command:

```bash
cat > /tmp/constraint.yaml <<EOF
apiVersion: constraints.gatekeeper.sh/v1beta1
kind: K8sPSPPrivilegedContainer
metadata:
  name: psp-privileged-container
spec:
  match:
    kinds:
      - apiGroups: [""]
        kinds: ["Pod"]
EOF
```

If we now try and deploy a privileged nginx pod by running the following:

```bash
cat > /tmp/example.yaml <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: bad-nginx
  labels:
    app: bad-nginx
spec:
  containers:
  - name: nginx
    image: nginx
    securityContext:
      privileged: true
EOF
kubectl create -f /tmp/example.yaml
```

We should see an error message similar to below:

```bash
Error from server ([denied by psp-privileged-container] Privileged container is not allowed: nginx, securityContext: {"privileged": true}): error when creating "example.yaml": admission webhook "validation.gatekeeper.sh" denied the request: [denied by psp-privileged-container] Privileged container is not allowed: nginx, securityContext: {"privileged": true}
```

As explained above the request was denied by the Kubernetes API because it didn't meet the requirement forced by OPA Gatekeeper.

## Limitations

- **Note: PSP's will be deprecated as of Kubernetes version 1.21 so please keep that in mind while you are evaluating this add-on. To learn more please follow this [link](https://kubernetes.io/blog/2021/04/06/podsecuritypolicy-deprecation-past-present-and-future/)**

- Currently only works on Linux based OS's

- Gatekeeper does not provide the ability to generate new policies based on new resources or services created. An example would be if you were to create a new namespace and being able to have Gatekeeper generate a new policy based on the namespace that was just created. 

- Gatekeeper does not provide an OpenAPI validation schema.

- Gatekeeper does not provide the ability to create self-service reports based on the policies living within the cluster. 