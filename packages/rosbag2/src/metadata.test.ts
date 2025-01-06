import { parseQosProfiles } from "./metadata";

describe("parseQosProfiles", () => {
  it("parses a single QOS profile", () => {
    const profiles = parseQosProfiles(
      `- history: 3\n  depth: 0\n  reliability: 1\n  durability: 2\n  deadline:\n    sec: 0\n    nsec: 0\n  lifespan:\n    sec: 10\n    nsec: 0\n  liveliness: 1\n  liveliness_lease_duration:\n    sec: 0\n    nsec: 0\n  avoid_ros_namespace_conventions: false`,
    );
    expect(profiles).toHaveLength(1);
    const profile = profiles[0]!;
    expect(profile.history).toEqual(3);
    expect(profile.depth).toEqual(0);
    expect(profile.reliability).toEqual(1);
    expect(profile.durability).toEqual(2);
    expect(profile.deadline).toBeUndefined();
    expect(profile.lifespan).toEqual({ sec: 10, nsec: 0 });
    expect(profile.liveliness).toEqual(1);
    expect(profile.livelinessLeaseDuration).toBeUndefined();
    expect(profile.avoidRosNamespaceConventions).toEqual(false);
  });
});
