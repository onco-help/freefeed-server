# API Versions

All backward-incompatible OncoHelp API changes will be documented in this file.

See the [About API versions](#about-api-versions) section in the end of this
file for the general versioning information.

## [3] - 2024-06-21

### Changed
- Serialized posts now contains the _omittedCommentsOffset_ field. If post
  contains some omitted comments, this field contains the offset of omitted part
  in the _comments_ array. Client must use the _omitCommentsOffset_ field to
  determine, which of the _comments_ are before and after the omitted part.

  It is a broken change because in V2 API responses, when some comments are
  omitted, the _comments_ array always has two items. The V2 clients treats the
  _comments_ array as [beforeOmitted, afterOmitted].

  In the V3 API response, the _comments_ array can have more than two items, and
  the _omittedCommentsOffset_ can have values other than '1'.

## [2] - 2022-11-01

This is the initial API version (it is "2" instead of "1" for historical
reasons).

---

## About API versions

### General rules

OncoHelp API versions are a monotonically increasing sequence of integers. Any
backward incompatible API changes causes an increase in the version.

OncoHelp may support not only the latest version of the API, but several
previous versions as well. However, very old versions may be declared obsolete
and unsupported.

At each point in time, two versions of the API are specified: the current,
latest, version (*Vcurr*) and the minimum supported version (*Vmin*). Any
version in this inclusive range is supported by the server.

### Specifying a version in the request

Each REST API request has a path prefix with the version number. For example,
`GET /v2/server-info` is a request to the method `/server-info` of API version
2.

The real-time (socket.io) endpoint has a fixed path. The client must pass the
version number in the URL request parameter named `apiVersion`.

### Unsupported versions

If the client specified a version less than *Vmin* in the request, the server
will process the request as if the version was equal to *Vmin*.

If the client specified a version greater than *Vcurr* in the request, the
server will return a *404 Not Found* response.

It is different for realtime endpoint. Any version outside the [*Vmin* -
*Vcurr*] range is considered as the *Vmin* version.