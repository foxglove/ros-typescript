import { Duration, Time, areEqual as areTimesEqual } from "@foxglove/rostime";

import {
  QosPolicyDurability,
  QosPolicyHistory,
  QosPolicyLiveliness,
  QosPolicyReliability,
  QosProfile,
} from "./types";
import { parseYaml } from "./yaml";

type Obj = Record<string, unknown>;

const TIME_ZERO: Time = { sec: 0, nsec: 0 };
const DURATION_INFINITY: Duration = { sec: 2147483647, nsec: 4294967295 };

/**
 * Parses a YAML string into a list of ROS2 QoS profiles. Missing values will be filled in with
 * rosbag2 QoS defaults.
 *
 * These are the default values for QoS profile fields, according to
 * <https://github.com/ros2/rosbag2/blob/master/README.md#overriding-qos-profiles>
 *
 *   history: keep_last
 *   depth: 10
 *   reliability: reliable
 *   durability: volatile
 *   deadline:
 *     # unspecified/infinity
 *     sec: 0
 *     nsec: 0
 *   lifespan:
 *     # unspecified/infinity
 *     sec: 0
 *     nsec: 0
 *   liveliness: system_default
 *   liveliness_lease_duration:
 *     # unspecified/infinity
 *     sec: 0
 *     nsec: 0
 * avoid_ros_namespace_conventions: false
 * @param data A string in YAML format
 * @returns A list of parsed QoS profiles
 */
export function parseQosProfiles(data: string): QosProfile[] {
  const parsed = parseYaml(data);
  return Array.isArray(parsed) ? getQosProfiles(parsed as Obj[]) : [];
}

function getQosProfiles(array: Obj[]): QosProfile[] {
  const profiles: QosProfile[] = [];
  for (const entryMaybe of array) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (entryMaybe == undefined) {
      continue;
    }
    profiles.push(getQosProfile(entryMaybe));
  }
  return profiles;
}

function getQosProfile(obj: Obj): QosProfile {
  const history = getNumber(obj, "history") ?? -1;
  const reliability = getNumber(obj, "reliability") ?? -1;
  const durability = getNumber(obj, "durability") ?? -1;
  const liveliness = getNumber(obj, "liveliness") ?? -1;

  return {
    history: history in QosPolicyHistory ? history : QosPolicyHistory.KeepLast,
    depth: getNumber(obj, "depth") ?? 10,
    reliability: reliability in QosPolicyReliability ? reliability : QosPolicyReliability.Reliable,
    durability: durability in QosPolicyDurability ? durability : QosPolicyDurability.Volatile,
    deadline: getDuration(obj, "deadline"),
    lifespan: getDuration(obj, "lifespan"),
    liveliness: liveliness in QosPolicyLiveliness ? liveliness : QosPolicyLiveliness.SystemDefault,
    livelinessLeaseDuration: getDuration(obj, "liveliness_lease_duration"),
    avoidRosNamespaceConventions: getBoolean(obj, "avoid_ros_namespace_conventions") ?? false,
  };
}

function getNumber(obj: Obj, field: string): number | undefined {
  const value = obj[field];
  return typeof value === "bigint" ? Number(value) : typeof value === "number" ? value : undefined;
}

function getBoolean(obj: Obj, field: string): boolean | undefined {
  const value = obj[field];
  return typeof value === "boolean"
    ? value
    : typeof value === "bigint" || typeof value === "number"
      ? Boolean(value)
      : undefined;
}

function getDuration(obj: Obj, field: string): Duration | undefined {
  const value = obj[field] as Obj | undefined;
  if (value == undefined) {
    return undefined;
  }
  // This handles both bigint and number types
  const duration = { sec: Number(value["sec"]), nsec: Number(value["nsec"]) };
  if (
    isNaN(duration.sec) ||
    isNaN(duration.nsec) ||
    areTimesEqual(duration, TIME_ZERO) ||
    areTimesEqual(duration, DURATION_INFINITY)
  ) {
    return undefined;
  }
  return duration;
}
