# Kafka Issue Fixed

## Problem
Kafka container was failing with error:
```
error in executing the command: environment variable "KAFKA_PROCESS_ROLES" is not set
```

## Root Cause
The latest Confluent Kafka image (latest tag) has changed to use KRaft mode by default, which requires `KAFKA_PROCESS_ROLES`. However, we're using Zookeeper mode.

## Solution
Changed Kafka configuration to:
1. Use a specific version (7.5.0) that works well with Zookeeper
2. Removed KRaft-specific environment variables
3. Kept Zookeeper-based configuration

## Fixed Configuration
- Image: `confluentinc/cp-kafka:7.5.0` (instead of `latest`)
- Uses Zookeeper mode (no KAFKA_PROCESS_ROLES needed)
- Added `KAFKA_AUTO_CREATE_TOPICS_ENABLE: "true"` for convenience

## Status
After restart, Kafka should now start successfully and be accessible on port 9092.

