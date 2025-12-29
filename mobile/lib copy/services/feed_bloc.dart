import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'dart:convert';

class VideoItem {
  final String id;
  final String url;
  final String thumbUrl;
  final String caption;
  final String userId;
  final String username;
  final int duration;
  final int likeCount;
  final int commentCount;

  VideoItem({
    required this.id,
    required this.url,
    required this.thumbUrl,
    required this.caption,
    required this.userId,
    required this.username,
    required this.duration,
    required this.likeCount,
    required this.commentCount,
  });

  factory VideoItem.fromJson(Map<String, dynamic> json) {
    return VideoItem(
      id: json['id'],
      url: json['video_url'],
      thumbUrl: json['thumb_url'],
      caption: json['caption'] ?? '',
      userId: json['user_id'],
      username: json['users']['username'] ?? 'Unknown',
      duration: json['duration'] ?? 0,
      likeCount: json['like_count'] ?? 0,
      commentCount: json['comment_count'] ?? 0,
    );
  }
}

class FeedBloc extends ChangeNotifier {
  final Supabase _supabase = Supabase.instance;
  
  List<VideoItem> videos = [];
  List<VideoPlayerController?> _controllers = [];
  
  bool isLoading = false;
  bool hasMore = true;
  int offset = 0;
  final int limit = 20;
  
  ScrollController scrollController = ScrollController();

  FeedBloc() {
    scrollController.addListener(_onScroll);
  }

  void _onScroll() {
    // Check if reached end of list
    if (scrollController.position.pixels == scrollController.position.maxScrollExtent) {
      if (hasMore && !isLoading) {
        loadMore();
      }
    }
  }

  Future<void> loadFeed() async {
    isLoading = true;
    offset = 0;
    videos.clear();
    notifyListeners();

    try {
      final response = await _supabase.client
          .from('videos')
          .select('*, users:user_id(id, username, display_name, avatar_url)')
          .order('created_at', ascending: false)
          .range(0, limit - 1);

      if (response.isEmpty) {
        hasMore = false;
      } else {
        videos = (response as List)
            .map((v) => VideoItem.fromJson(v))
            .toList();
        offset = limit;
      }
    } catch (e) {
      print('Error loading feed: $e');
    }

    isLoading = false;
    notifyListeners();
  }

  Future<void> loadMore() async {
    if (isLoading || !hasMore) return;

    isLoading = true;
    notifyListeners();

    try {
      final response = await _supabase.client
          .from('videos')
          .select('*, users:user_id(id, username, display_name, avatar_url)')
          .order('created_at', ascending: false)
          .range(offset, offset + limit - 1);

      if (response.isEmpty) {
        hasMore = false;
      } else {
        videos.addAll(
          (response as List)
              .map((v) => VideoItem.fromJson(v))
              .toList(),
        );
        offset += limit;
      }
    } catch (e) {
      print('Error loading more videos: $e');
    }

    isLoading = false;
    notifyListeners();
  }

  // Pre-load video controllers (keep 3 in memory)
  Future<VideoPlayerController?> getController(int index) async {
    // Ensure controllers list is large enough
    while (_controllers.length <= index) {
      _controllers.add(null);
    }

    if (_controllers[index] != null) {
      return _controllers[index];
    }

    try {
      final controller = VideoPlayerController.network(
        videos[index].url,
        videoPlayerOptions: VideoPlayerOptions(
          mixWithOthers: true,
          allowBackgroundPlayback: false,
        ),
      );

      await controller.initialize();
      _controllers[index] = controller;

      // Dispose oldest controller if more than 3 in memory
      int activeCount = _controllers.where((c) => c != null).length;
      if (activeCount > 3) {
        for (int i = 0; i < index - 2; i++) {
          if (_controllers[i] != null) {
            await _controllers[i]!.dispose();
            _controllers[i] = null;
            break;
          }
        }
      }

      return controller;
    } catch (e) {
      print('Error loading video controller: $e');
      return null;
    }
  }

  void trackView(String videoId) {
    _supabase.client
        .from('views')
        .insert({'video_id': videoId, 'user_id': _supabase.client.auth.currentUser?.id})
        .then((_) {
          // View tracked
        })
        .catchError((e) => print('Error tracking view: $e'));
  }

  @override
  void dispose() {
    scrollController.dispose();
    for (var controller in _controllers) {
      controller?.dispose();
    }
    super.dispose();
  }
}
