import os from "os";

import { NetworkInterface } from "../TcpTypes";

export function getPid(): number {
  return process.pid;
}

export function getEnvVar(envVar: string): string | undefined {
  return process.env[envVar];
}

export function getHostname(): string | undefined {
  return os.hostname();
}

export function getNetworkInterfaces(): NetworkInterface[] {
  const output: NetworkInterface[] = [];
  const ifaces = os.networkInterfaces();
  for (const [name, iface] of Object.entries(ifaces)) {
    if (iface != undefined) {
      for (const info of iface) {
        output.push({ name, ...info, cidr: info.cidr ?? undefined });
      }
    }
  }
  return output;
}
