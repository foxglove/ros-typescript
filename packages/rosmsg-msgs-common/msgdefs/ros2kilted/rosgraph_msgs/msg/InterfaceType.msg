# Represent a type of a ROS Graph Interface

# The plaintext namespaced name of the type - e.g. sensor_msgs/Image
string name

# The hash uniquely identifies the exact structure of the type,
# the definition of which may change between package version
TypeHash hash

================================================================================
MSG: rosgraph_msgs/TypeHash
# RIHS spec version
uint8 version 1
# ROSIDL_TYPE_HASH_SIZE == 32
uint8[32] value

