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
    ],
  });

  registerComponent(Collider, {
    name: 'Collider',
    properties: [],
  });

  registerComponent(FixedJoint, {
    name: 'FixedJoint',
    properties: [
      { key: 'connectedObject', type: 'gameObjectRef' },
      { key: 'anchor', type: 'vec3' },
      { key: 'connectedAnchor', type: 'vec3' },
      { key: 'autoConfigureConnectedAnchor', type: 'boolean' },
    ],
  });

  registerComponent(HingeJoint, {
    name: 'HingeJoint',
    properties: [
      { key: 'connectedObject', type: 'gameObjectRef' },
      { key: 'anchor', type: 'vec3' },
      { key: 'connectedAnchor', type: 'vec3' },
      { key: 'autoConfigureConnectedAnchor', type: 'boolean' },
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
    properties: [
      { key: 'connectedObject', type: 'gameObjectRef' },
      { key: 'anchor', type: 'vec3' },
      { key: 'connectedAnchor', type: 'vec3' },
      { key: 'autoConfigureConnectedAnchor', type: 'boolean' },
      { key: 'restLength', type: 'number', min: 0, max: 100, step: 0.1 },
      { key: 'stiffness', type: 'number', min: 0, max: 1000, step: 1 },
      { key: 'damping', type: 'number', min: 0, max: 100, step: 0.1 },
    ],
  });
}
