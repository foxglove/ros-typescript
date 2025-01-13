# This represents a Polygon with reference coordinate frame and timestamp
# It includes a unique identification field for disambiguating multiple instances

std_msgs/Header header
geometry_msgs/PolygonInstance polygon

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
MSG: geometry_msgs/PolygonInstance
# A specification of a polygon where the first and last points are assumed to be connected
# It includes a unique identification field for disambiguating multiple instances

geometry_msgs/Polygon polygon
int64 id

================================================================================
MSG: geometry_msgs/Polygon
# A specification of a polygon where the first and last points are assumed to be connected

Point32[] points

================================================================================
MSG: geometry_msgs/Point32
# This contains the position of a point in free space(with 32 bits of precision).
# It is recommended to use Point wherever possible instead of Point32.
#
# This recommendation is to promote interoperability.
#
# This message is designed to take up less space when sending
# lots of points at once, as in the case of a PointCloud.

float32 x
float32 y
float32 z

