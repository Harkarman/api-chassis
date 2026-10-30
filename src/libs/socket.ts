import type {DefaultEventsMap} from 'socket.io';
import {Server, Socket as SocketIO} from 'socket.io';
import {Logger} from '..';

export class Socket {
  static io: Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>;

  static emit(eventName: string, data: any) {
    return Socket.io.emit(eventName, data);
  }

  static on(eventName: string, cb: (...args: any[]) => void) {
    return Socket.io.on(eventName, cb);
  }

  static client(
    cb: (
      socket: SocketIO<
        DefaultEventsMap,
        DefaultEventsMap,
        DefaultEventsMap,
        any
      >
    ) => void,
    debug = false
  ) {
    Socket.io.on('connection', function (socket) {
      if (debug) {
        Logger.debug('Client Connected', socket.id);
      }
      cb(socket);
      // Whenever someone disconnects this piece of code executed
      socket.on('disconnect', function () {
        Logger.debug('Client Disconnected', socket.id);
      });
    });
  }
}
