import { registerComponent } from '@atmos/core';
import { RigidBody } from './rigid-body.js';
import { Collider } from './collider.js';
import { FixedJoint } from './fixed-joint.js';
import { HingeJoint } from './hinge-joint.js';
import { SpringJoint } from './spring-joint.js';

export function registerPhysicsBuiltins(): void {
  registerComponent(RigidBody, {
    name: 'RigidBody',
    properties: [
      { key: 'bodyType', type: 'enum', options: ['dynamic', 'fixed', 'kinematic'] },
      { key: 'linearDamping', type: 'number', min: 0, max: 100, step: 0.1 },
      { key: 'angularDamping', type: 'number', min: 0, max: 100, step: 0.1 },
      { key: 'gravityScale', type: 'number', min: -10, max: 10, step: 0.1 },
      { key: 'interpolate', type: 'boolean' },
    ],
  });

  registerComponent(Collider, {
    name: 'Collider',
    properties: [
      { key: 'friction', type: 'number', min: 0, max: 2, step: 0.05 },
      { key: 'restitution', type: 'number', min: 0, max: 1, step: 0.05 },
      { key: 'density', type: 'number', min: 0.01, max: 100, step: 0.1 },
      { key: 'isSensor', type: 'boolean' },
    ],
  });

  registerComponent(FixedJoint, {
    name: 'FixedJoint',
    allowMultiple: true,
    properties: [
      { key: 'connectedObject', type: 'gameObjectRef' },
      { key: 'anchor', type: 'vec3' },
      { key: 'autoConfigureConnectedAnchor', type: 'boolean' },
      { key: 'connectedAnchor', type: 'vec3',
        visibleWhen: (c) => !(c as FixedJoint).autoConfigureConnectedAnchor },
    ],
  });

  registerComponent(HingeJoint, {
    name: 'HingeJoint',
    allowMultiple: true,
    properties: [
      { key: 'connectedObject', type: 'gameObjectRef' },
      { key: 'anchor', type: 'vec3' },
      { key: 'autoConfigureConnectedAnchor', type: 'boolean' },
      { key: 'connectedAnchor', type: 'vec3',
        visibleWhen: (c) => !(c as HingeJoint).autoConfigureConnectedAnchor },
      { key: 'axis', type: 'vec3' },
      { key: 'connectedAxis', type: 'vec3',
        visibleWhen: (c) => !(c as HingeJoint).autoConfigureConnectedAxis },
      { key: 'autoConfigureConnectedAxis', type: 'boolean' },
      { key: 'limitsEnabled', type: 'boolean' },
      { key: 'limitMin', type: 'number', min: -Math.PI, max: 0, step: 0.01 },
      { key: 'limitMax', type: 'number', min: 0, max: Math.PI, step: 0.01 },
      { key: 'motorEnabled', type: 'boolean' },
      { key: 'motorMode', type: 'enum', options: ['velocity', 'position'],
        visibleWhen: (c) => (c as HingeJoint).motorEnabled },
      { key: 'motorTargetVelocity', type: 'number', min: -100, max: 100, step: 0.1,
        visibleWhen: (c) => (c as HingeJoint).motorEnabled && (c as HingeJoint).motorMode === 'velocity' },
      { key: 'motorMaxForce', type: 'number', min: 0, max: 10000, step: 1,
        visibleWhen: (c) => (c as HingeJoint).motorEnabled && (c as HingeJoint).motorMode === 'velocity' },
      { key: 'motorTargetPosition', type: 'number', min: -Math.PI, max: Math.PI, step: 0.01,
        visibleWhen: (c) => (c as HingeJoint).motorEnabled && (c as HingeJoint).motorMode === 'position' },
      { key: 'motorStiffness', type: 'number', min: 0, max: 10000, step: 1,
        visibleWhen: (c) => (c as HingeJoint).motorEnabled && (c as HingeJoint).motorMode === 'position' },
      { key: 'motorDamping', type: 'number', min: 0, max: 1000, step: 0.1,
        visibleWhen: (c) => (c as HingeJoint).motorEnabled && (c as HingeJoint).motorMode === 'position' },
    ],
  });

  registerComponent(SpringJoint, {
    name: 'SpringJoint',
    allowMultiple: true,
    properties: [
      { key: 'connectedObject', type: 'gameObjectRef' },
      { key: 'anchor', type: 'vec3' },
      { key: 'autoConfigureConnectedAnchor', type: 'boolean' },
      { key: 'connectedAnchor', type: 'vec3',
        visibleWhen: (c) => !(c as SpringJoint).autoConfigureConnectedAnchor },
      { key: 'restLength', type: 'number', min: 0, max: 100, step: 0.1 },
      { key: 'stiffness', type: 'number', min: 0, max: 1000, step: 1 },
      { key: 'damping', type: 'number', min: 0, max: 100, step: 0.1 },
    ],
  });
}
