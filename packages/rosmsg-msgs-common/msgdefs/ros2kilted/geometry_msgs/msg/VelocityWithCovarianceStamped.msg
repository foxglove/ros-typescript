# A timestamped velocity of a body whose frame is 'body_frame_id', measured
# relative to the reference frame 'reference_frame_id', with the velocity and
# covariance both expressed in the basis of the observation frame
# 'header.frame_id'.
#
# - If 'body_frame_id' and 'header.frame_id' are identical, the velocity and
#   covariance are expressed in the body's own basis. This is functionally
#   equivalent to the body-twist convention used by
#   'geometry_msgs/TwistStamped'.
#
# This message is the covariance-bearing analogue of
# 'geometry_msgs/VelocityStamped'.

std_msgs/Header header
string body_frame_id
string reference_frame_id
TwistWithCovariance velocity

================================================================================
MSG: std_msgs/Header
# Standard metadata for higher-level stamped data types.
# This is generally used to communicate timestamped data
# in a particular coordinate frame.

# Two-integer timestamp that is expressed as seconds and nanoseconds.
builtin_interfaces/Time stamp

# Transform frame with which this data is associated.
string frame_id

================================================================================
MSG: geometry_msgs/TwistWithCovariance
# This expresses velocity in free space with uncertainty.

Twist twist

# Row-major representation of the 6x6 covariance matrix
# The orientation parameters use a fixed-axis representation.
# In order, the parameters are:
# (x, y, z, rotation about X axis, rotation about Y axis, rotation about Z axis)
float64[36] covariance

================================================================================
MSG: geometry_msgs/Twist
# This expresses velocity in free space broken into its linear and angular parts.

Vector3  linear
Vector3  angular

================================================================================
MSG: geometry_msgs/Vector3
# This represents a vector in free space.

# This is semantically different than a point.
# A vector is always anchored at the origin.
# When a transform is applied to a vector, only the rotational component is applied.

float64 x
float64 y
float64 z

