import { bench } from "./bench";

async function main() {
  await bench({
    name: "int8 array",
    lastField: (msg) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
      void (msg as any).arr[99999];
    },
    msgDef: `int8[] arr`,
    msg: {
      arr: new Int8Array(100000).fill(3),
    },
  });

  await bench({
    name: "float32 array",
    lastField: (msg) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
      void (msg as any).arr[99999];
    },
    msgDef: `float32[] arr`,
    msg: {
      arr: new Float32Array(100000).fill(3),
    },
  });

  await bench({
    name: "std_msgs/Header",
    lastField: (msg) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
      void (msg as any).frame_id;
    },
    msgDef: `
      uint32 seq
      time stamp
      string frame_id
    `,
    msg: {
      seq: 0,
      stamp: { sec: 0, nsec: 0 },
      frame_id: "frame id",
    },
  });

  await bench({
    name: "sensor_msgs/PointCloud2",
    lastField: (msg) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
      void (msg as any).is_dense;
    },
    msgDef: `
    Header header
    uint32 height
    uint32 width
    PointField[] fields
    bool    is_bigendian
    uint32  point_step
    uint32  row_step
    uint8[] data
    bool is_dense
    ===================
    MSG: std_msgs/Header
    uint32 seq
    time stamp
    string frame_id
    ===================
    MSG: sensor_msgs/PointField
    string name
    uint32 offset
    uint8  datatype
    uint32 count
      `,
    msg: {
      header: {
        seq: 0,
        stamp: { sec: 0, nsec: 0 },
        frame_id: "frame id",
      },
      height: 100,
      width: 100,
      fields: [
        { name: "field 1", offset: 0, datatype: 0, count: 0 },
        { name: "field 2", offset: 0, datatype: 0, count: 0 },
        { name: "field 3", offset: 0, datatype: 0, count: 0 },
        { name: "field 4", offset: 0, datatype: 0, count: 0 },
      ],
      is_bigendian: false,
      point_step: 0,
      row_step: 0,
      data: new Uint8Array(1000000).fill(0),
      is_dense: false,
    },
  });

  await bench({
    name: "diagnostic_msgs/DiagnosticArray",
    lastField: (msg) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
      void (msg as any).status[19].values[19].value;
    },
    msgDef: `
    Header header
    DiagnosticStatus[] status
    ======================
    MSG: std_msgs/Header
    uint32 seq
    time stamp
    string frame_id
    ================
    MSG: misc/DiagnosticStatus
    byte level
    string name
    string message
    string hardware_id
    KeyValue[] values
    ================
    MSG: misc/KeyValue
    string key
    string value
    `,
    msg: {
      header: {
        seq: 0,
        stamp: { sec: 0, nsec: 0 },
        frame_id: "frame id",
      },
      status: new Array(20).fill({
        level: 0,
        name: "some name",
        message: "some message usually longer",
        hardware_id: "some hardware id",
        values: new Array(20).fill({ key: "a key", value: "some value" }),
      }),
    },
  });
}

void main();
