# @indutny/proto

WIP

## Limitations

Because streams are reused between several requests, if one of the requests
gets stalled it might stall all other requests that are based on the same input
stream. Depending on the use case, either more granular contexts could be used
or a timeout could be added to all derived streams.

## LICENSE

This software is licensed under the MIT License.
