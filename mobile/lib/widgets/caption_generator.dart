import 'package:http/http.dart' as http;
import 'dart:convert';

class CaptionGenerator {
  static const String huggingFaceModel = 'facebook/bart-large-cnn';
  static const String apiUrl = 'https://api-inference.huggingface.co/models/$huggingFaceModel';

  // Generate AI caption for video (optional feature)
  // This calls Hugging Face inference API for free
  static Future<String?> generateCaption(
    String videoPath, {
    String? apiKey,
    int maxLength = 100,
  }) async {
    try {
      // For now, return null (requires setting up Hugging Face API)
      // In production: extract frames, convert to text, then summarize
      return null;
    } catch (e) {
      print('Error generating caption: $e');
      return null;
    }
  }

  // Fallback: simple caption from user input
  static String sanitizeCaption(String input, {int maxLength = 150}) {
    final cleaned = input.trim();
    if (cleaned.length > maxLength) {
      return cleaned.substring(0, maxLength) + '...';
    }
    return cleaned;
  }
}
