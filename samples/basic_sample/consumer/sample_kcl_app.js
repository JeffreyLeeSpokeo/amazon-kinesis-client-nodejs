/***
Copyright 2015 Amazon.com, Inc. or its affiliates. All Rights Reserved.

Licensed under the Amazon Software License (the "License").
You may not use this file except in compliance with the License.
A copy of the License is located at

http://aws.amazon.com/asl/

or in the "license" file accompanying this file. This file is distributed
on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
express or implied. See the License for the specific language governing
permissions and limitations under the License.
***/

'use strict';


var fs = require('fs');
var path = require('path');
var util = require('util');
var kcl = require('../../..');
var logger = require('../../util/logger');
var aws = require('aws-sdk');
var redis = require("redis")
var redisClient = redis.createClient(6379, 'jeffredis.yljwlc.0001.usw2.cache.amazonaws.com');
var firehose = new aws.Firehose({
  apiVersion: '2015-08-04',
  region : 'us-west-2'
});

/**
 * A simple implementation for the record processor (consumer) that simply writes the data to a log file.
 *
 * Be careful not to use the 'stderr'/'stdout'/'console' as log destination since it is used to communicate with the
 * {https://github.com/awslabs/amazon-kinesis-client/blob/master/src/main/java/com/amazonaws/services/kinesis/multilang/package-info.java MultiLangDaemon}.
 */

function recordProcessor() {
  var log = logger().getLogger('recordProcessor');
  var shardId;

  return {

    initialize: function(initializeInput, completeCallback) {
      shardId = initializeInput.shardId;

      completeCallback();
    },

    processRecords: function(processRecordsInput, completeCallback) {
      if (!processRecordsInput || !processRecordsInput.records) {
        completeCallback();
        return;
      }
      var records = processRecordsInput.records;
      log.info(records);
      var record, data, sequenceNumber, partitionKey;
      for (var i = 0 ; i < records.length ; ++i) {
        record = records[i];
        data = new Buffer(record.data, 'base64').toString();

        log.info("====================data================");
        log.info("data:" + data);
        redisClient.set("123", data);
        var test = redisClient.get("123", function(err, reply) {
            log.info("=====================redis==================");
            log.info(JSON.parse(reply));
          }
        );

        log.info("===============firehose==================");
        var data_json = JSON.parse(data);
        var firehose_data = data_json.time + '|' + data_json.sensor + '|' + data_json.call_type + '|' + data_json.apikey + '\n';
        log.info("firehose data:" + firehose_data);
        var firehose_data = {
          DeliveryStreamName: 'JeffFirehose',
          Record: {
            Data: firehose_data
          }
        };
        log.info(firehose_data);
        firehose.putRecord(firehose_data, function(err, data){
          log.info("Hosed my Redshift");
          log.info("error:" + err);
          log.info("after data:" + data);
        });
        log.info("==============everything should be done==============");

        sequenceNumber = record.sequenceNumber;
        partitionKey = record.partitionKey;
        log.info(util.format('ShardID: %s, Record: %s, SeqenceNumber: %s, PartitionKey:%s', shardId, data, sequenceNumber, partitionKey));
      }
      if (!sequenceNumber) {
        completeCallback();
        return;
      }
      // If checkpointing, completeCallback should only be called once checkpoint is complete.
      processRecordsInput.checkpointer.checkpoint(sequenceNumber, function(err, sequenceNumber) {
        log.info(util.format('Checkpoint successful. ShardID: %s, SeqenceNumber: %s', shardId, sequenceNumber));
        completeCallback();
      });
    },

    shutdown: function(shutdownInput, completeCallback) {
      // Checkpoint should only be performed when shutdown reason is TERMINATE.
      if (shutdownInput.reason !== 'TERMINATE') {
        completeCallback();
        return;
      }
      // Whenever checkpointing, completeCallback should only be invoked once checkpoint is complete.
      shutdownInput.checkpointer.checkpoint(function(err) {
        completeCallback();
      });
    }
  };
}

kcl(recordProcessor()).run();
