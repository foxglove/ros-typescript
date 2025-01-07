import { parseRos2idl } from "@foxglove/ros2idl-parser";
import { parse as parseMessageDefinition } from "@foxglove/rosmsg";

import { MessageWriter } from "./MessageWriter";

const serializeString = (str: string): Uint8Array => {
  const data = Buffer.from(str, "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(data.byteLength + 1, 0);
  return Uint8Array.from([...len, ...data, 0x00]);
};

const float32Buffer = (floats: number[]): Uint8Array => {
  return new Uint8Array(Float32Array.from(floats).buffer);
};

describe("MessageWriter", () => {
  it.each([
    [`int8 sample # lowest`, [0x80], { sample: -128 }],
    [`int8 sample # highest`, [0x7f], { sample: 127 }],
    [`uint8 sample # lowest`, [0x00], { sample: 0 }],
    [`uint8 sample # highest`, [0xff], { sample: 255 }],
    [`int16 sample # lowest`, [0x00, 0x80], { sample: -32768 }],
    [`int16 sample # highest`, [0xff, 0x7f], { sample: 32767 }],
    [`uint16 sample # lowest`, [0x00, 0x00], { sample: 0 }],
    [`uint16 sample # highest`, [0xff, 0xff], { sample: 65535 }],
    [`int32 sample # lowest`, [0x00, 0x00, 0x00, 0x80], { sample: -2147483648 }],
    [`int32 sample # highest`, [0xff, 0xff, 0xff, 0x7f], { sample: 2147483647 }],
    [`uint32 sample # lowest`, [0x00, 0x00, 0x00, 0x00], { sample: 0 }],
    [`uint32 sample # highest`, [0xff, 0xff, 0xff, 0xff], { sample: 4294967295 }],
    [
      `int64 sample # lowest`,
      [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x80],
      { sample: -9223372036854775808n },
    ],
    [
      `int64 sample # highest`,
      [0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x7f],
      { sample: 9223372036854775807n },
    ],
    [`uint64 sample # lowest`, [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], { sample: 0n }],
    [
      `uint64 sample # highest`,
      [0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff],
      { sample: 18446744073709551615n },
    ],
    [`float32 sample`, float32Buffer([5.5]), { sample: 5.5 }],
    [
      `float64 sample`,
      // eslint-disable-next-line no-loss-of-precision
      new Uint8Array(Float64Array.of(0.123456789121212121212).buffer),
      // eslint-disable-next-line no-loss-of-precision
      { sample: 0.123456789121212121212 },
    ],
    [
      `builtin_interfaces/Time stamp`,
      [0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00],
      {
        stamp: {
          sec: 0,
          nsec: 1,
        },
      },
    ],
    [
      `builtin_interfaces/Duration stamp`,
      [0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00],
      {
        stamp: {
          sec: 0,
          nsec: 1,
        },
      },
    ],
    [
      `int32[] arr`,
      [
        ...[0x02, 0x00, 0x00, 0x00], // length
        ...new Uint8Array(Int32Array.of(3, 7).buffer),
      ],
      { arr: Int32Array.from([3, 7]) },
    ],
    [
      `time[1] arr`,
      [0x01, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00],
      { arr: [{ sec: 1, nsec: 2 }] },
    ],
    [
      `duration[1] arr`,
      [0x01, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00],
      { arr: [{ sec: 1, nsec: 2 }] },
    ],
    [
      `time[] arr`,
      [0x01, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x03, 0x00, 0x00, 0x00],
      { arr: [{ sec: 2, nsec: 3 }] },
    ],
    [
      `duration[] arr`,
      [0x01, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x03, 0x00, 0x00, 0x00],
      { arr: [{ sec: 2, nsec: 3 }] },
    ],
    // unaligned access
    [
      `uint8 blank\nint32[] arr`,
      [
        0x00,
        ...[0x00, 0x00, 0x00], // alignment
        ...[0x02, 0x00, 0x00, 0x00], // length
        ...new Uint8Array(Int32Array.of(3, 7).buffer),
      ],
      { blank: 0, arr: Int32Array.from([3, 7]) },
    ],
    [
      `uint8 blank\ntime[] arr`,
      [
        0x00,
        ...[0x00, 0x00, 0x00], // alignment
        ...[0x01, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x03, 0x00, 0x00, 0x00],
      ],
      { blank: 0, arr: [{ sec: 2, nsec: 3 }] },
    ],
    [`float32[2] arr`, float32Buffer([5.5, 6.5]), { arr: Float32Array.from([5.5, 6.5]) }],
    [
      `uint8 blank\nfloat32[2] arr`,
      [
        0x00,
        ...[0x00, 0x00, 0x00], // alignment
        ...float32Buffer([5.5, 6.5]),
      ],
      { blank: 0, arr: Float32Array.from([5.5, 6.5]) },
    ],
    [
      `float32[] arr`,
      [
        ...[0x02, 0x00, 0x00, 0x00], // length
        ...float32Buffer([5.5, 6.5]),
      ],
      { arr: Float32Array.from([5.5, 6.5]) },
    ],
    [
      `uint8 blank\nfloat32[] arr`,
      [
        0x00,
        ...[0x00, 0x00, 0x00], // alignment
        ...[0x02, 0x00, 0x00, 0x00],
        ...float32Buffer([5.5, 6.5]),
      ],
      { blank: 0, arr: Float32Array.from([5.5, 6.5]) },
    ],
    [
      `float32[] first\nfloat32[] second`,
      [
        ...[0x02, 0x00, 0x00, 0x00], // length
        ...float32Buffer([5.5, 6.5]),
        ...[0x02, 0x00, 0x00, 0x00], // length
        ...float32Buffer([5.5, 6.5]),
      ],
      {
        first: Float32Array.from([5.5, 6.5]),
        second: Float32Array.from([5.5, 6.5]),
      },
    ],
    [`string sample # empty string`, serializeString(""), { sample: "" }],
    [`string sample # some string`, serializeString("some string"), { sample: "some string" }],
    [`int8[4] first`, [0x00, 0xff, 0x80, 0x7f], { first: new Int8Array([0, -1, -128, 127]) }],
    [
      `int8[] first`,
      [
        ...[0x04, 0x00, 0x00, 0x00], // length
        0x00,
        0xff,
        0x80,
        0x7f,
      ],
      { first: new Int8Array([0, -1, -128, 127]) },
    ],
    [`uint8[4] first`, [0x00, 0xff, 0x80, 0x7f], { first: new Uint8Array([0, -1, -128, 127]) }],
    [
      `string[2] first`,
      [...serializeString("one"), ...serializeString("longer string")],
      { first: ["one", "longer string"] },
    ],
    [
      `string[] first`,
      [
        ...[0x02, 0x00, 0x00, 0x00], // length
        ...serializeString("one"),
        ...serializeString("longer string"),
      ],
      { first: ["one", "longer string"] },
    ],
    // first size value after fixed size value
    [`int8 first\nint8 second`, [0x80, 0x7f], { first: -128, second: 127 }],
    [
      `string first\nint8 second`,
      [...serializeString("some string"), 0x80],
      { first: "some string", second: -128 },
    ],
    [
      `CustomType custom
    ============
    MSG: custom_type/CustomType
    uint8 first`,
      [0x02],
      {
        custom: { first: 0x02 },
      },
    ],
    [
      `CustomType[3] custom
    ============
    MSG: custom_type/CustomType
    uint8 first`,
      [0x02, 0x03, 0x04],
      {
        custom: [{ first: 0x02 }, { first: 0x03 }, { first: 0x04 }],
      },
    ],
    [
      `CustomType[] custom
    ============
    MSG: custom_type/CustomType
    uint8 first`,
      [
        ...[0x03, 0x00, 0x00, 0x00], // length
        0x02,
        0x03,
        0x04,
      ],
      {
        custom: [{ first: 0x02 }, { first: 0x03 }, { first: 0x04 }],
      },
    ],
    // ignore constants
    [
      `int8 STATUS_ONE = 1
       int8 STATUS_TWO = 2
       int8 status`,
      [0x02],
      { status: 2 },
    ],
    // An array of custom types which themselves have a custom type
    // This tests an array's ability to properly size custom types
    [
      `CustomType[] custom
    ============
    MSG: custom_type/CustomType
    MoreCustom another
    ============
    MSG: custom_type/MoreCustom
    uint8 field`,
      [
        ...[0x03, 0x00, 0x00, 0x00], // length
        0x02,
        0x03,
        0x04,
      ],
      {
        custom: [
          { another: { field: 0x02 } },
          { another: { field: 0x03 } },
          { another: { field: 0x04 } },
        ],
      },
    ],
  ])(
    "should serialize %s",
    (msgDef: string, arr: Iterable<number>, message: Record<string, unknown>) => {
      const expected = Uint8Array.from([0, 1, 0, 0, ...arr]);
      const writer = new MessageWriter(parseMessageDefinition(msgDef, { ros2: true }));
      const written = writer.writeMessage(message);

      expect(written).toBytesEqual(expected);
      expect(writer.calculateByteSize(message)).toEqual(expected.byteLength);
    },
  );

  it("should serialize a ROS 2 log message", () => {
    const expected = Uint8Array.from(
      Buffer.from(
        "00010000fb65865e80faae0614000000120000006d696e696d616c5f7075626c69736865720000001e0000005075626c697368696e673a202748656c6c6f2c20776f726c64212030270000004c0000002f6f70742f726f73325f77732f656c6f7175656e742f7372632f726f73322f6578616d706c65732f72636c6370702f6d696e696d616c5f7075626c69736865722f6c616d6264612e637070000b0000006f70657261746f722829000026000000",
        "hex",
      ),
    );
    const msgDef = `
    byte DEBUG=10
    byte INFO=20
    byte WARN=30
    byte ERROR=40
    byte FATAL=50
    ##
    ## Fields
    ##
    builtin_interfaces/Time stamp
    uint8 level
    string name # name of the node
    string msg # message
    string file # file the message came from
    string function # function the message came from
    uint32 line # line the message came from
    `;
    const writer = new MessageWriter(parseMessageDefinition(msgDef, { ros2: true }));
    const message = {
      stamp: { sec: 1585866235, nsec: 112130688 },
      level: 20,
      name: "minimal_publisher",
      msg: "Publishing: 'Hello, world! 0'",
      file: "/opt/ros2_ws/eloquent/src/ros2/examples/rclcpp/minimal_publisher/lambda.cpp",
      function: "operator()",
      line: 38,
    };
    const written = writer.writeMessage(message);
    expect(written).toBytesEqual(expected);
    expect(writer.calculateByteSize(message)).toEqual(expected.byteLength);
  });

  it("should serialize a ROS 2 tf2_msgs/TFMessage", () => {
    const expected = Uint8Array.from(
      Buffer.from(
        "0001000001000000286fae6169ddd73108000000747572746c6531000e000000747572746c65315f616865616400000000000000000000000000f03f00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000f03f",
        "hex",
      ),
    );
    const msgDef = `
    geometry_msgs/TransformStamped[] transforms
    ================================================================================
    MSG: geometry_msgs/TransformStamped
    Header header
    string child_frame_id # the frame id of the child frame
    Transform transform
    ================================================================================
    MSG: std_msgs/Header
    builtin_interfaces/Time stamp
    string frame_id
    ================================================================================
    MSG: geometry_msgs/Transform
    Vector3 translation
    Quaternion rotation
    ================================================================================
    MSG: geometry_msgs/Vector3
    float64 x
    float64 y
    float64 z
    ================================================================================
    MSG: geometry_msgs/Quaternion
    float64 x
    float64 y
    float64 z
    float64 w
    `;
    const writer = new MessageWriter(parseMessageDefinition(msgDef, { ros2: true }));
    const message = {
      transforms: [
        {
          header: {
            stamp: { sec: 1638821672, nsec: 836230505 },
            frame_id: "turtle1",
          },
          child_frame_id: "turtle1_ahead",
          transform: {
            translation: { x: 1, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
          },
        },
      ],
    };
    const written = writer.writeMessage(message);
    expect(written).toBytesEqual(expected);
    expect(writer.calculateByteSize(message)).toEqual(expected.byteLength);
  });

  it("should serialize a ROS 2 IDL tf2_msgs/TFMessage", () => {
    // same buffer as above
    const expected = Uint8Array.from(
      Buffer.from(
        "0001000001000000286fae6169ddd73108000000747572746c6531000e000000747572746c65315f616865616400000000000000000000000000f03f00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000f03f",
        "hex",
      ),
    );
    const msgDef = `
================================================================================
IDL: geometry_msgs/msg/Transforms

module geometry_msgs {
  module msg {
    struct Transforms {
      sequence<geometry_msgs::msg::TransformStamped> transforms;
    };
  };
};
================================================================================
IDL: geometry_msgs/msg/TransformStamped

module geometry_msgs {
  module msg {
    struct TransformStamped {
      std_msgs::msg::Header header;
      string child_frame_id; // the frame id of the child frame
      geometry_msgs::msg::Transform transform;
    };
  };
};
================================================================================
IDL: std_msgs/msg/Header

module std_msgs {
  module msg {
    struct Header {
      builtin_interfaces::Time stamp;
      string frame_id;
    };
  };
};
================================================================================
IDL: geometry_msgs/msg/Transform

module geometry_msgs {
  module msg {
    struct Transform {
      geometry_msgs::msg::Vector3 translation;
      geometry_msgs::msg::Quaternion rotation;
    };
  };
};

================================================================================
IDL: geometry_msgs/msg/Vector3

module geometry_msgs {
  module msg {
    struct Vector3 {
      double x;
      double y;
      double z;
    };
  };
};

================================================================================
IDL: geometry_msgs/msg/Quaternion

module geometry_msgs {
  module msg {
    struct Quaternion {
      double x;
      double y;
      double z;
      double w;
    };
  };
};

================================================================================
IDL: builtin_interfaces/Time
// Normally added when generating idl schemas

module builtin_interfaces {
  struct Time {
    int32 sec;
    uint32 nanosec;
  };
};
    `;

    const writer = new MessageWriter(parseRos2idl(msgDef));
    const message = {
      transforms: [
        {
          header: {
            stamp: { sec: 1638821672, nanosec: 836230505 },
            frame_id: "turtle1",
          },
          child_frame_id: "turtle1_ahead",
          transform: {
            translation: { x: 1, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
          },
        },
      ],
    };
    const written = writer.writeMessage(message);
    expect(written).toBytesEqual(expected);
    expect(writer.calculateByteSize(message)).toEqual(expected.byteLength);
  });

  it("should serialize an empty ROS 2 msg (e.g. std_msgs/msg/Empty)", () => {
    const expected = Uint8Array.from(Buffer.from("0001000000", "hex"));
    const msgDef = ``;
    const writer = new MessageWriter(parseMessageDefinition(msgDef, { ros2: true }));
    const message = {};
    const written = writer.writeMessage(message);

    expect(written).toBytesEqual(expected);
    expect(writer.calculateByteSize(message)).toEqual(expected.byteLength);
  });

  it("should serialize a custom msg with a std_msgs/msg/Empty field followed by uint8", () => {
    const expected = Uint8Array.from(Buffer.from("00010000007b", "hex"));
    const msgDef = `
    std_msgs/msg/Empty empty
    uint8 uint_8_field
    ================================================================================
    MSG: std_msgs/msg/Empty
    `;
    const writer = new MessageWriter(parseMessageDefinition(msgDef, { ros2: true }));
    const message = { uint_8_field: 123 };
    const written = writer.writeMessage(message);

    expect(written).toBytesEqual(expected);
    expect(writer.calculateByteSize(message)).toEqual(expected.byteLength);
  });

  it("should serialize a custom msg with a std_msgs/msg/Empty field followed by int32", () => {
    const expected = Uint8Array.from(Buffer.from("00010000000000007b000001", "hex"));
    const msgDef = `
    std_msgs/msg/Empty empty
    int32 int_32_field
    ================================================================================
    MSG: std_msgs/msg/Empty
    `;
    const writer = new MessageWriter(parseMessageDefinition(msgDef, { ros2: true }));
    const message = { int_32_field: 16777339 };
    const written = writer.writeMessage(message);

    expect(written).toBytesEqual(expected);
    expect(writer.calculateByteSize(message)).toEqual(expected.byteLength);
  });

  it("should serialize a custom msg withan empty message (with constants) followed by int32", () => {
    const expected = Uint8Array.from(Buffer.from("00010000000000007b000001", "hex"));
    const msgDef = `
    custom_msgs/msg/Nothing empty
    int32 int_32_field
    ================================================================================
    MSG: custom_msgs/msg/Nothing
    int32 EXAMPLE=123
    `;
    const writer = new MessageWriter(parseMessageDefinition(msgDef, { ros2: true }));
    const message = { int_32_field: 16777339 };
    const written = writer.writeMessage(message);

    expect(written).toBytesEqual(expected);
    expect(writer.calculateByteSize(message)).toEqual(expected.byteLength);
  });

  it("ros2idl should choose non-constant root definition", () => {
    const message = { status: 2 };
    const messageBin = [0x02];
    const msgDef = `
    module a {
      module b {
        const int8 STATUS_ONE = 1;
        const int8 STATUS_TWO = 2;
      };
      struct c {
       int8 status;
      };
    };
    `;

    const expected = Uint8Array.from([0, 1, 0, 0, ...messageBin]);

    const writer = new MessageWriter(parseRos2idl(msgDef));
    const written = writer.writeMessage(message);

    expect(written).toBytesEqual(expected);
    expect(writer.calculateByteSize(message)).toEqual(expected.byteLength);
  });

  it.each([
    ["float64", 10, 84],
    ["time", 10, 84],
    ["uint8", 5, 9],
  ])(
    "should default initialize a fixed-length %s array",
    (type, arrayLength, expectedByteLength) => {
      const msgDef = [
        {
          definitions: [
            {
              type,
              name: "array",
              isArray: true,
              arrayLength,
            },
          ],
        },
      ];
      const msgWriter = new MessageWriter(msgDef);
      const written = msgWriter.writeMessage({});
      expect(written.byteLength).toEqual(expectedByteLength);
    },
  );

  it("should throw when writing an array with wrong size to fixed-length array", () => {
    const msgDef = [
      {
        definitions: [
          {
            type: "float64",
            name: "array",
            isArray: true,
            arrayLength: 10,
          },
        ],
      },
    ];
    const msgWriter = new MessageWriter(msgDef);
    expect(() => msgWriter.writeMessage({ array: [] })).toThrow();
    expect(() => msgWriter.writeMessage({ array: new Float64Array() })).toThrow();
    expect(() => msgWriter.writeMessage({ array: new Float64Array(5) })).toThrow();
    expect(() => msgWriter.writeMessage({ array: new Float64Array(10) })).not.toThrow();
    expect(() => msgWriter.writeMessage({ array: new Array(10).fill(0) })).not.toThrow();
  });

  it.each([{ isArray: false }, { isArray: true, arrayLength: 10 }])(
    "should throw exepction when encountering wstring fields",
    (def) => {
      const msgDef = [
        {
          definitions: [
            {
              type: "wstring",
              name: "array",
              ...def,
            },
          ],
        },
      ];

      const msgWriter = new MessageWriter(msgDef);
      expect(() => msgWriter.writeMessage({ array: [] })).toThrow(
        "wstring is implementation-defined and therefore not supported",
      );
    },
  );

  it("should serialize a ROS 2 rcl_interfaces/srv/SetParameters Request with default values", () => {
    // The expected serialized message below was generated with the following python script:
    // ```py
    // from rclpy.serialization import serialize_message
    // from rcl_interfaces.srv import SetParameters
    // from rcl_interfaces.msg import Parameter, ParameterValue, ParameterType
    // request = SetParameters.Request()
    // request.parameters = [
    //     Parameter(name='foo', value=ParameterValue(type=ParameterType.PARAMETER_INTEGER, integer_value=42)),
    //     Parameter(name='bar', value=ParameterValue(type=ParameterType.PARAMETER_STRING, string_value="baz")),
    // ]
    // print(serialize_message(request).hex())
    // ```
    const expected = Uint8Array.from(
      Buffer.from(
        "000100000200000004000000666f6f00020000002a00000000000000000000000000000001000000000000000000000000000000000000000000000000000000040000006261720004000000000000000000000000000000000000000400000062617a00000000000000000000000000000000000000000000000000000000000000000000000000",
        "hex",
      ),
    );
    const msgDef = `
    Parameter[] parameters
    ================================================================================
    MSG: rcl_interfaces/msg/Parameter
    string name
    ParameterValue value
    ================================================================================
    MSG: rcl_interfaces/msg/ParameterValue
    uint8 type
    bool bool_value
    int64 integer_value
    float64 double_value
    string string_value
    byte[] byte_array_value
    bool[] bool_array_value
    int64[] integer_array_value
    float64[] double_array_value
    string[] string_array_value
    `;

    const writer = new MessageWriter(parseMessageDefinition(msgDef, { ros2: true }));
    const message = {
      parameters: [
        {
          name: "foo",
          value: {
            type: 2,
            integer_value: 42,
          },
        },
        {
          name: "bar",
          value: {
            type: 4,
            string_value: "baz",
          },
        },
      ],
    };
    const written = writer.writeMessage(message);
    expect(written.buffer).toBytesEqual(expected);
    expect(writer.calculateByteSize(message)).toEqual(expected.byteLength);
  });
});
