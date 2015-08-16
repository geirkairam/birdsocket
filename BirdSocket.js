var net = require('net');
var q = require('q');

var bird_SocketTimeout = 5000;
var debug = false;

BirdSocket = function(ipv) {
  me = this;

  this.getRoutesBySession = function getRoutesBySession(ipv, session) {
    var deferred = new q.defer();

    var socket = new net.Socket();
    socket.setTimeout(bird_SocketTimeout);

    var routes = [];

    socket.connect(me._script(ipv), function() {
      var command = 'show route protocol '+session+' filter { if bgp_path.last=44194 && bgp_path.len=1 then accept; }\n';
    });

    socket.on('data', function(data) {
      var lines = new String(data).split('\n');
      for (var i=0;i<lines.length;i++) {
        me._toRoutes(line[i], routes);

        //end of data is not send everytime >:(
        if (lines[i].indexOf('0000') > -1) {
          me._debug('resolved routes:');
          me._debug(routes);
          deferred.resolve(routes);
          socket.destroy();
          me._debug('<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<');
        }
      }
    });

    socket.on('timeout', function() {
      deferred.resolve(table);
      socket.destroy();
    });
  }

  //prmomis to return routes announced by an as
  this.getRoutesByAS = function getRoutesByAS(ipv, as) {
    var deferred = new q.defer();

    var socket = new net.Socket();
    socket.setTimeout(bird_SocketTimeout);

    var routes = [];

    //TODO fail on script is empty;
    socket.connect(me._script(ipv), function() {
      var command = 'show route filter { if bgp_path.last='+as+' && bgp_path.len=1 then accept; } primary\n';
      socket.write(command);
    });
    socket.on('data', function(data) {
      me._debug('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
      me._debug('get '+ipv+' routes for as '+as);
      var lines = new String(data).split('\n');
      for (var i=0;i<lines.length;i++) {
        me._toRoutes(lines[i], routes);
        //end of data is not send everytime >:(
        if (lines[i].indexOf('0000') > -1) {
          me._debug('resolved routes:');
          me._debug(routes);
          deferred.resolve(routes);
          socket.destroy();
          me._debug('<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<');
        }
      }
    });

    socket.on('end', function() {
      me._debug('END EVENT get routes for as '+as);
    });

    //retourn found routes in case end of data was not sent
    socket.on('timeout', function() {
      me._debug('TIMEOUT get routes for as '+as);
      me._debug('resolved routes:');
      me._debug(routes);
      deferred.resolve(routes);
      socket.destroy();
      me._debug('<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<');
    });

    //TODO fail on socket error
    return deferred.promise;
  }

  this._toRoutes = function _toRoutes(line, routes) {
    me._debug(line);
    //0001 is bird starting promt
    //0000 is end of data
    if (line.indexOf('0001') == -1 && line.indexOf('0000') == -1) {
      var splitted = line.split('via');
      var route = splitted[0].trim();
      if (route != '') {
        //1007 is some other bird status we want to remove
        if (route.indexOf('1007-') > -1) {
          route = route.substr(5);
        }
        routes.push(route);
      }
    }
  }


  //promise to return data from show protocols
  this.showProtocols = function showProtocols(ipv) {
    me._debug('show protocols '+ipv+' called');
    var deferred = new q.defer();

    var table = [];

    var socket = new net.Socket();
    socket.setTimeout(bird_SocketTimeout);

    //TODO fail on script is empty
    socket.connect(me._script(ipv), function() {
      socket.write("show protocols\n");
    });
    socket.on("data", function(data) {
      var lines = new String(data).split('\n');
      for (var i=0;i<lines.length;i++) {
        me._debug(lines[i]);
        //only handle BGP sessions here, so we filter all that can not be splitted by this
        var rowdata = lines[i].split(' BGP ');
        if (typeof(rowdata[1]) != 'undefined') {
          var row = {
            name:rowdata[0].trim().replace(" ","")
          }
          if (ipv == 4) {
            row.v4 = me._toProtocolData(rowdata);
          } else if (ipv == 6) {
            row.v6 = me._toProtocolData(rowdata);
          }
          table.push(row);
        }
        if (lines[i].indexOf('0000') > -1) {
          deferred.resolve(table);
          socket.destroy();
        }
      }
    });

    socket.on('timeout', function() {
      deferred.resolve(table);
      socket.destroy();
    });

    //TODO fail on socket error
    return deferred.promise;
  };

  this._toProtocolData = function _toProtocolData(rowdata) {
    return {
      table:rowdata[1].trim().substr(0,9).trim(),
      state:rowdata[1].trim().substr(9,7).trim(),
      since:rowdata[1].trim().substr(16,12).trim(),
      connection:rowdata[1].trim().substr(28,14).trim(),
      info:rowdata[1].trim().substr(42)
    };
  };

  this._script = function _script(ipv) {
    var script ="";
    if(ipv == 4) {
      return '/run/bird/bird.ctl';
    } else if (ipv == 6) {
      return '/run/bird/bird6.ctl';
    } else {
      console.log("ip version "+ this.ipv+" not supported");
    }
  };

  this._debug = function _debug(msg) {
    if (debug) {
      console.log(msg);
    }
  }
}

exports.BirdSocket = BirdSocket;
