import { RosXmlRpcClient } from "./RosXmlRpcClient.js";
import { RosXmlRpcResponse } from "./XmlRpcTypes.js";

export class RosMasterClient extends RosXmlRpcClient {
  async registerService(
    callerId: string,
    service: string,
    serviceApi: string,
    callerApi: string,
  ): Promise<RosXmlRpcResponse> {
    return await this._methodCall("registerService", [callerId, service, serviceApi, callerApi]);
  }

  async unregisterService(
    callerId: string,
    service: string,
    serviceApi: string,
  ): Promise<RosXmlRpcResponse> {
    return await this._methodCall("unregisterService", [callerId, service, serviceApi]);
  }

  async registerSubscriber(
    callerId: string,
    topic: string,
    topicType: string,
    callerApi: string,
  ): Promise<RosXmlRpcResponse> {
    return await this._methodCall("registerSubscriber", [callerId, topic, topicType, callerApi]);
  }

  async unregisterSubscriber(
    callerId: string,
    topic: string,
    callerApi: string,
  ): Promise<RosXmlRpcResponse> {
    return await this._methodCall("unregisterSubscriber", [callerId, topic, callerApi]);
  }

  async registerPublisher(
    callerId: string,
    topic: string,
    topicType: string,
    callerApi: string,
  ): Promise<RosXmlRpcResponse> {
    return await this._methodCall("registerPublisher", [callerId, topic, topicType, callerApi]);
  }

  async unregisterPublisher(
    callerId: string,
    topic: string,
    callerApi: string,
  ): Promise<RosXmlRpcResponse> {
    return await this._methodCall("unregisterPublisher", [callerId, topic, callerApi]);
  }

  async lookupNode(callerId: string, nodeName: string): Promise<RosXmlRpcResponse> {
    return await this._methodCall("lookupNode", [callerId, nodeName]);
  }

  async getPublishedTopics(callerId: string, subgraph = ""): Promise<RosXmlRpcResponse> {
    return await this._methodCall("getPublishedTopics", [callerId, subgraph]);
  }

  async getTopicTypes(callerId: string): Promise<RosXmlRpcResponse> {
    return await this._methodCall("getTopicTypes", [callerId]);
  }

  async getSystemState(callerId: string): Promise<RosXmlRpcResponse> {
    return await this._methodCall("getSystemState", [callerId]);
  }

  async getUri(callerId: string): Promise<RosXmlRpcResponse> {
    return await this._methodCall("getUri", [callerId]);
  }

  async lookupService(callerId: string, service: string): Promise<RosXmlRpcResponse> {
    return await this._methodCall("lookupService", [callerId, service]);
  }
}
