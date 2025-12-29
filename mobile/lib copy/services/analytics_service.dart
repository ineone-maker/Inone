import 'package:http/http.dart' as http;
import 'dart:convert';
import 'dart:async';
import 'package:uuid/uuid.dart';

class AnalyticsEvent {
  final String eventId;
  final String userId;
  final String videoId;
  final String event; // 'imp', 'w50', 'skip', 'like'
  final DateTime timestamp;

  AnalyticsEvent({
    required this.eventId,
    required this.userId,
    required this.videoId,
    required this.event,
    required this.timestamp,
  });

  Map<String, dynamic> toJson() => {
    'eventId': eventId,
    'userId': userId,
    'videoId': videoId,
    'event': event,
    'timestamp': timestamp.toIso8601String(),
  };
}

class AnalyticsService {
  static const String backendUrl = 'http://localhost:3000'; // Update with actual URL
  static const int BATCH_TIMEOUT_MS = 5000; // Flush every 5 seconds
  static const int BATCH_SIZE = 10; // Or 10 items

  final String userId;
  late List<AnalyticsEvent> _eventQueue;
  late Timer _flushTimer;
  bool _isTrackingEnabled = true;

  AnalyticsService({required this.userId}) {
    _eventQueue = [];
    _startFlushTimer();
    _checkPrivacySettings();
  }

  void _startFlushTimer() {
    _flushTimer = Timer.periodic(Duration(milliseconds: BATCH_TIMEOUT_MS), (_) {
      if (_eventQueue.isNotEmpty) {
        flush();
      }
    });
  }

  Future<void> _checkPrivacySettings() async {
    try {
      final response = await http.get(
        Uri.parse('$backendUrl/interactions/settings/$userId'),
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        _isTrackingEnabled = !data['doNotTrack'];
      }
    } catch (e) {
      print('Error checking privacy settings: $e');
    }
  }

  void trackImpression(String videoId) {
    if (!_isTrackingEnabled) return;
    
    _addEvent(AnalyticsEvent(
      eventId: const Uuid().v4(),
      userId: userId,
      videoId: videoId,
      event: 'imp',
      timestamp: DateTime.now(),
    ));
  }

  void trackWatched50(String videoId) {
    if (!_isTrackingEnabled) return;
    
    _addEvent(AnalyticsEvent(
      eventId: const Uuid().v4(),
      userId: userId,
      videoId: videoId,
      event: 'w50',
      timestamp: DateTime.now(),
    ));
  }

  void trackSkip(String videoId) {
    if (!_isTrackingEnabled) return;
    
    _addEvent(AnalyticsEvent(
      eventId: const Uuid().v4(),
      userId: userId,
      videoId: videoId,
      event: 'skip',
      timestamp: DateTime.now(),
    ));
  }

  void trackLike(String videoId) {
    if (!_isTrackingEnabled) return;
    
    _addEvent(AnalyticsEvent(
      eventId: const Uuid().v4(),
      userId: userId,
      videoId: videoId,
      event: 'like',
      timestamp: DateTime.now(),
    ));
  }

  void _addEvent(AnalyticsEvent event) {
    _eventQueue.add(event);

    // Flush if batch is full
    if (_eventQueue.length >= BATCH_SIZE) {
      flush();
    }
  }

  Future<void> flush() async {
    if (_eventQueue.isEmpty) return;

    final events = List<AnalyticsEvent>.from(_eventQueue);
    _eventQueue.clear();

    try {
      final response = await http.post(
        Uri.parse('$backendUrl/interactions'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'events': events.map((e) => e.toJson()).toList(),
        }),
      ).timeout(Duration(seconds: 10));

      if (response.statusCode != 200) {
        print('Error sending analytics: ${response.statusCode}');
        // Re-add events to queue on failure
        _eventQueue.addAll(events);
      }
    } catch (e) {
      print('Error flushing analytics: $e');
      // Re-add events to queue on failure
      _eventQueue.addAll(events);
    }
  }

  void dispose() {
    // Flush remaining events before disposing
    if (_eventQueue.isNotEmpty) {
      flush();
    }
    _flushTimer.cancel();
  }
}
