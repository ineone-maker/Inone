import 'package:http/http.dart' as http;
import 'dart:convert';

class VideoService {
  static const String backendUrl = 'http://localhost:3000'; // Update with actual URL
  
  // Get presigned URL for video upload
  static Future<Map<String, dynamic>> getPresignedUrl(String fileName, String fileType) async {
    try {
      final response = await http.post(
        Uri.parse('$backendUrl/upload/presign'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'fileName': fileName,
          'fileType': fileType,
        }),
      ).timeout(Duration(seconds: 10));

      if (response.statusCode == 200) {
        return jsonDecode(response.body);
      } else {
        throw Exception('Failed to get presigned URL');
      }
    } catch (e) {
      throw Exception('Error: $e');
    }
  }

  // Upload thumbnail
  static Future<String> uploadThumbnail(String videoId, String base64Data) async {
    try {
      final response = await http.post(
        Uri.parse('$backendUrl/upload/thumbnail'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'videoId': videoId,
          'base64Data': base64Data,
        }),
      ).timeout(Duration(seconds: 30));

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return data['thumbUrl'];
      } else {
        throw Exception('Failed to upload thumbnail');
      }
    } catch (e) {
      throw Exception('Error: $e');
    }
  }

  // Create video metadata
  static Future<void> createVideo({
    required String userId,
    required String videoId,
    required String caption,
    required String videoUrl,
    required String thumbUrl,
    required int duration,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$backendUrl/videos'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'userId': userId,
          'videoId': videoId,
          'caption': caption,
          'videoUrl': videoUrl,
          'thumbUrl': thumbUrl,
          'duration': duration,
        }),
      ).timeout(Duration(seconds: 10));

      if (response.statusCode != 200) {
        throw Exception('Failed to create video');
      }
    } catch (e) {
      throw Exception('Error: $e');
    }
  }

  // Retry logic with exponential backoff
  static Future<T> retryOperation<T>(
    Future<T> Function() operation, {
    int maxAttempts = 3,
    Duration initialDelay = const Duration(seconds: 1),
  }) async {
    int attempt = 0;
    Duration delay = initialDelay;

    while (attempt < maxAttempts) {
      try {
        return await operation();
      } catch (e) {
        attempt++;
        if (attempt >= maxAttempts) {
          rethrow;
        }
        await Future.delayed(delay);
        delay *= 2; // Exponential backoff
      }
    }

    throw Exception('Operation failed after $maxAttempts attempts');
  }
}
