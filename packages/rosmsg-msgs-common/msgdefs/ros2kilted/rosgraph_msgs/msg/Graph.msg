# Represents a ROS node graph, which is only a collection of nodes
Node[] nodes

================================================================================
MSG: rosgraph_msgs/Node
# Represents the observable runtime state of a ROS Node
# Therefore, does not perfectly align with the abstract specification which created it.

# Fully qualified node name (FQN)
string name

# Parameter specifications for the node
rcl_interfaces/ParameterDescriptor[] parameters

# Current values of the node's parameters
# NOTE:
#   parameter_values[] must be empty, or the same size as parameters[]
#   When set, parameter_values[] match 1:1 with the same index in parameters[]
rcl_interfaces/ParameterValue[] parameter_values

# Communications endpoints - Topics, Services, and Actions
Topic[] publishers
Topic[] subscriptions

Service[] service_clients
Service[] service_servers

Action[] action_clients
Action[] action_servers

================================================================================
MSG: rcl_interfaces/ParameterDescriptor
# This is the message to communicate a parameter's descriptor.

# The name of the parameter.
string name

# Enum values are defined in the `ParameterType.msg` message.
uint8 type

# Description of the parameter, visible from introspection tools.
string description

# Parameter constraints

# Plain English description of additional constraints which cannot be expressed
# with the available constraints, e.g. "only prime numbers".
#
# By convention, this should only be used to clarify constraints which cannot
# be completely expressed with the parameter constraints below.
string additional_constraints

# If 'true' then the value cannot change after it has been initialized.
bool read_only false

# If true, the parameter is allowed to change type.
bool dynamic_typing false

# If any of the following sequences are not empty, then the constraint inside of
# them apply to this parameter.
#
# FloatingPointRange and IntegerRange are mutually exclusive.

# FloatingPointRange consists of a from_value, a to_value, and a step.
FloatingPointRange[<=1] floating_point_range

# IntegerRange consists of a from_value, a to_value, and a step.
IntegerRange[<=1] integer_range

================================================================================
MSG: rcl_interfaces/ParameterValue
# Used to determine which of the next *_value fields are set.
# ParameterType.PARAMETER_NOT_SET indicates that the parameter was not set
# (if gotten) or is uninitialized.
# Values are enumerated in `ParameterType.msg`.

# The type of this parameter, which corresponds to the appropriate field below.
uint8 type

# "Variant" style storage of the parameter value. Only the value corresponding
# the type field will have valid information.

# Boolean value, can be either true or false.
bool bool_value

# Integer value ranging from -9,223,372,036,854,775,808 to
# 9,223,372,036,854,775,807.
int64 integer_value

# A double precision floating point value following IEEE 754.
float64 double_value

# A textual value with no practical length limit.
string string_value

# An array of bytes, used for non-textual information.
byte[] byte_array_value

# An array of boolean values.
bool[] bool_array_value

# An array of 64-bit integer values.
int64[] integer_array_value

# An array of 64-bit floating point values.
float64[] double_array_value

# An array of string values.
string[] string_array_value

================================================================================
MSG: rosgraph_msgs/Topic
# Describes a single topic endpoint, which may be a Publisher or Subscription

# Fully qualified name of the topic
string name

# Type of the topic
InterfaceType type

# Observed QoS of the endpoint
QoSProfile qos

================================================================================
MSG: rosgraph_msgs/Service
# Describes a single Service endpoint, which may be a Server or Client

# Fully qualified name of the Service
string name

# Type and actual QoS of the request publisher (Client) or subscription (Server)
InterfaceType request_type
QoSProfile request_qos

# Type and actual QoS of the request subscription (Client) or publisher (Server)
InterfaceType response_type
QoSProfile response_qos

================================================================================
MSG: rosgraph_msgs/Action
# Describes a single Action endpoint, which may be a Server or Client

# Fully qualified name of the Action
string name

# An action is actually a composition of the following fundamental ROS entities
Service send_goal
Service get_result
Service cancel_goal
Topic feedback
Topic status

================================================================================
MSG: rcl_interfaces/FloatingPointRange
# Represents bounds and a step value for a floating point typed parameter.

# Start value for valid values, inclusive.
float64 from_value

# End value for valid values, inclusive.
float64 to_value

# Size of valid steps between the from and to bound.
# 
# Step is considered to be a magnitude, therefore negative values are treated
# the same as positive values, and a step value of zero implies a continuous
# range of values.
#
# Ideally, the step would be less than or equal to the distance between the
# bounds, as well as an even multiple of the distance between the bounds, but
# neither are required.
#
# If the absolute value of the step is larger than or equal to the distance
# between the two bounds, then the bounds will be the only valid values. e.g. if
# the range is defined as {from_value: 1.0, to_value: 2.0, step: 5.0} then the
# valid values will be 1.0 and 2.0.
#
# If the step is less than the distance between the bounds, but the distance is
# not a multiple of the step, then the "to" bound will always be a valid value,
# e.g. if the range is defined as {from_value: 2.0, to_value: 5.0, step: 2.0}
# then the valid values will be 2.0, 4.0, and 5.0.
float64 step

================================================================================
MSG: rcl_interfaces/IntegerRange
# Represents bounds and a step value for an integer typed parameter.

# Start value for valid values, inclusive.
int64 from_value

# End value for valid values, inclusive.
int64 to_value

# Size of valid steps between the from and to bound.
#
# A step value of zero implies a continuous range of values. Ideally, the step
# would be less than or equal to the distance between the bounds, as well as an
# even multiple of the distance between the bounds, but neither are required.
#
# If the absolute value of the step is larger than or equal to the distance
# between the two bounds, then the bounds will be the only valid values. e.g. if
# the range is defined as {from_value: 1, to_value: 2, step: 5} then the valid
# values will be 1 and 2.
# 
# If the step is less than the distance between the bounds, but the distance is
# not a multiple of the step, then the "to" bound will always be a valid value,
# e.g. if the range is defined as {from_value: 2, to_value: 5, step: 2} then
# the valid values will be 2, 4, and 5.
uint64 step

================================================================================
MSG: rosgraph_msgs/InterfaceType
# Represent a type of a ROS Graph Interface

# The plaintext namespaced name of the type - e.g. sensor_msgs/Image
string name

# The hash uniquely identifies the exact structure of the type,
# the definition of which may change between package version
TypeHash hash

================================================================================
MSG: rosgraph_msgs/QoSProfile
# Message-based representation of ROS 2 Quality of Service settings
# Default values are kept in sync with RMW by integration test
# Note that SYSTEM_DEFAULT and BEST_AVAILABLE values cannot be an observed value,
# because they resolve concretely at runtime.
# They are included here for completeness to match the data structures in RMW

# Depth of the message queue (only meaningful when history==KEEP_LAST)
uint32 depth

# Deadline between messages (0 for no deadline)
builtin_interfaces/Duration deadline

# Lifespan of each message (0 for infinite)
builtin_interfaces/Duration lifespan

# History policy
uint8 HISTORY_SYSTEM_DEFAULT=0
uint8 HISTORY_KEEP_LAST=1
uint8 HISTORY_KEEP_ALL=2
uint8 HISTORY_UNKNOWN=3
uint8 history

# Reliability policy
uint8 RELIABILITY_SYSTEM_DEFAULT=0
uint8 RELIABILITY_RELIABLE=1
uint8 RELIABILITY_BEST_EFFORT=2
uint8 RELIABILITY_UNKNOWN=3
uint8 RELIABILITY_BEST_AVAILABLE=4
uint8 reliability

# Durability policy
uint8 DURABILITY_SYSTEM_DEFAULT=0
uint8 DURABILITY_TRANSIENT_LOCAL=1
uint8 DURABILITY_VOLATILE=2
uint8 DURABILITY_UNKNOWN=3
uint8 DURABILITY_BEST_AVAILABLE=4
uint8 durability

# Liveliness policy
uint8 LIVELINESS_SYSTEM_DEFAULT=0
uint8 LIVELINESS_AUTOMATIC=1
uint8 LIVELINESS_MANUAL_BY_TOPIC=3
uint8 LIVELINESS_UNKNOWN=4
uint8 LIVELINESS_BEST_AVAILABLE=5
uint8 liveliness

# Lease duration for liveliness (0 for infinite)
builtin_interfaces/Duration liveliness_lease_duration

================================================================================
MSG: rosgraph_msgs/TypeHash
# RIHS spec version
uint8 version 1
# ROSIDL_TYPE_HASH_SIZE == 32
uint8[32] value

