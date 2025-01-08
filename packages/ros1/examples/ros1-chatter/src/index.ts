import { RosNode } from "@foxglove/ros1";
import {
  TcpServerNode,
  TcpSocketNode,
  getEnvVar,
  getPid,
  getHostname,
  getNetworkInterfaces,
} from "@foxglove/ros1/nodejs";
import { HttpServerNodejs } from "@foxglove/xmlrpc/nodejs";

async function main() {
  const name = "/ros1-chatter";
  let rosNode: RosNode | undefined;

  try {
    const hostname = RosNode.GetRosHostname(getEnvVar, getHostname, getNetworkInterfaces);
    const tcpServer = await TcpServerNode.Listen({ host: hostname });
    rosNode = new RosNode({
      name,
      rosMasterUri: getEnvVar("ROS_MASTER_URI") ?? "http://localhost:11311/",
      hostname,
      pid: getPid(),
      httpServer: new HttpServerNodejs(),
      tcpSocketCreate: TcpSocketNode.Create,
      tcpServer,
      log: console,
    });

    await rosNode.start();

    await rosNode.advertise({
      topic: "/chatter",
      dataType: "std_msgs/String",
      latching: true,
      messageDefinition: [{ definitions: [{ name: "data", type: "string" }] }],
      messageDefinitionText: "string data",
      md5sum: "992ce8a1687cec8c8bd883ec73ca41d1",
    });

    let running = true;
    process.on("SIGINT", () => (running = false));

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    while (running) {
      void rosNode.publish("/chatter", { data: "Hello, world!" });
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } catch (err) {
    const msg = (err as Error).stack ?? `${err as Error}`;
    console.error(msg);
  } finally {
    rosNode?.shutdown();
  }
}

void main();
