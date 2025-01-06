## Unreleased

- Remove BagReader from public interface

## 0.1.1 - 2021-08-19

- Update rosmsg dependency
- Update rosmsg-serialization dependency

## 0.1.0 - 2021-08-06

First release after fork from rosbag.js

- Conversion to typescript
- Change APIs to use Uint8Array instead of node.js Buffer
- Change FileReader and BlobReader to be explicit entry points
- Remove MessageReader and MessageWriter - these are now in the @foxglove/rosmsg-serialization package
- Remove parseMessage - this is now in the @foxglove/rosmsg package
- Remove int53 dependency - use BigInt where possible
