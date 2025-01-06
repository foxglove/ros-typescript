import { RosNode } from "@foxglove/ros1";
import {
  TcpSocketNode,
  getEnvVar,
  getPid,
  getHostname,
  getNetworkInterfaces,
} from "@foxglove/ros1/nodejs";
import { HttpServerNodejs } from "@foxglove/xmlrpc/nodejs";

async function main() {
  const name = "/testclient";
  let rosNode: RosNode | undefined;

  try {
    const hostname = RosNode.GetRosHostname(getEnvVar, getHostname, getNetworkInterfaces);
    rosNode = new RosNode({
      name,
      rosMasterUri: getEnvVar("ROS_MASTER_URI") ?? "http://localhost:11311/",
      hostname,
      pid: getPid(),
      httpServer: new HttpServerNodejs(),
      tcpSocketCreate: TcpSocketNode.Create,
      log: console,
    });

    await rosNode.start();

    const sub = rosNode.subscribe({
      topic: "/turtle1/color_sensor",
      dataType: "turtlesim/Color",
    });
    console.dir(sub.getStats());
  } catch (err) {
    const msg = (err as Error).stack ?? `${err}`;
    console.error(msg);
  } finally {
    rosNode?.shutdown();
  }
}

void main();
