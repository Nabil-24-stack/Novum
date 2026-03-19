import test from "node:test";
import assert from "node:assert/strict";

import {
  useStrategyStore,
  type FlowData,
  type KeyFeaturesData,
  type UserFlow,
} from "../../hooks/useStrategyStore.ts";

function resetStrategyStore() {
  useStrategyStore.getState().reset();
}

test("setting flow data after build marks strategy as updated", () => {
  resetStrategyStore();

  const flowData: FlowData = {
    nodes: [{ id: "home", label: "Home", type: "page", description: "Landing page" }],
    connections: [],
  };

  useStrategyStore.getState().addCompletedPage("home");
  useStrategyStore.getState().setFlowData(flowData);

  assert.equal(useStrategyStore.getState().strategyUpdatedAfterBuild, true);
});

test("setting key features after build marks strategy as updated", () => {
  resetStrategyStore();

  const keyFeatures: KeyFeaturesData = {
    ideaTitle: "Guided workspace",
    features: [
      { name: "Context handoff", description: "Carries strategy forward.", priority: "high" },
    ],
  };

  useStrategyStore.getState().addCompletedPage("home");
  useStrategyStore.getState().setKeyFeaturesData(keyFeatures);

  assert.equal(useStrategyStore.getState().strategyUpdatedAfterBuild, true);
});

test("setting user flows after build marks strategy as updated", () => {
  resetStrategyStore();

  const userFlows: UserFlow[] = [
    {
      id: "flow-1",
      jtbdIndex: 0,
      jtbdText: "When work changes, I want to update the plan, so I can keep everyone aligned.",
      personaNames: ["Mina"],
      steps: [{ nodeId: "home", action: "Reviews the updated flow" }],
    },
  ];

  useStrategyStore.getState().addCompletedPage("home");
  useStrategyStore.getState().setUserFlowsData(userFlows);

  assert.equal(useStrategyStore.getState().strategyUpdatedAfterBuild, true);
});
