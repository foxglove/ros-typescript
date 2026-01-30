#!/usr/bin/env node

import { HttpServerNodejs } from "@foxglove/xmlrpc/nodejs";

import { getEnvVar, getHostname, getNetworkInterfaces } from "./platform.js";
import { RosMaster } from "../RosMaster.js";
import { RosNode } from "../RosNode.js";

async function main() {
  const hostname = RosNode.GetRosHostname(getEnvVar, getHostname, getNetworkInterfaces);
  const port = 11311;
  const httpServer = new HttpServerNodejs();
  const rosMaster = new RosMaster(httpServer);

  await rosMaster.start(hostname, port);
  console.log(`ROS_MASTER_URI=http://${hostname}:${port}/`);
}

void main();
