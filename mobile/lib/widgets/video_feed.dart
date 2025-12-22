import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:provider/provider.dart';
import '../services/feed_bloc.dart';

class VideoFeedWidget extends StatefulWidget {
  const VideoFeedWidget({Key? key}) : super(key: key);

  @override
  State<VideoFeedWidget> createState() => _VideoFeedWidgetState();
}

class _VideoFeedWidgetState extends State<VideoFeedWidget> {
  late PageController _pageController;
  int _currentIndex = 0;

  @override
  void initState() {
    super.initState();
    _pageController = PageController();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      Provider.of<FeedBloc>(context, listen: false).loadFeed();
    });
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<FeedBloc>(
      builder: (context, feedBloc, _) {
        if (feedBloc.isLoading && feedBloc.videos.isEmpty) {
          return Center(
            child: CircularProgressIndicator(),
          );
        }

        if (feedBloc.videos.isEmpty) {
          return Center(
            child: Text('No videos yet'),
          );
        }

        return PageView.builder(
          controller: _pageController,
          scrollDirection: Axis.vertical,
          onPageChanged: (index) {
            setState(() => _currentIndex = index);
            // Track view when video comes into view
            feedBloc.trackView(feedBloc.videos[index].id);
          },
          itemCount: feedBloc.videos.length + (feedBloc.hasMore ? 1 : 0),
          itemBuilder: (context, index) {
            if (index == feedBloc.videos.length) {
              return Center(
                child: CircularProgressIndicator(),
              );
            }

            final video = feedBloc.videos[index];
            return VideoCard(
              video: video,
              isActive: index == _currentIndex,
              feedBloc: feedBloc,
            );
          },
        );
      },
    );
  }
}

class VideoCard extends StatefulWidget {
  final VideoItem video;
  final bool isActive;
  final FeedBloc feedBloc;

  const VideoCard({
    required this.video,
    required this.isActive,
    required this.feedBloc,
    Key? key,
  }) : super(key: key);

  @override
  State<VideoCard> createState() => _VideoCardState();
}

class _VideoCardState extends State<VideoCard> {
  VideoPlayerController? _controller;
  bool _isInitialized = false;
  bool _showPlayButton = true;

  @override
  void initState() {
    super.initState();
    _initializeController();
  }

  Future<void> _initializeController() async {
    try {
      _controller = await widget.feedBloc.getController(
        widget.feedBloc.videos.indexOf(widget.video),
      );
      
      if (_controller != null) {
        setState(() => _isInitialized = true);
        
        if (widget.isActive) {
          await _controller!.play();
          setState(() => _showPlayButton = false);
        }
      }
    } catch (e) {
      print('Error initializing video: $e');
    }
  }

  @override
  void didUpdateWidget(VideoCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    
    if (widget.isActive && _controller != null && _isInitialized) {
      _controller!.play();
      setState(() => _showPlayButton = false);
    } else if (!widget.isActive && _controller != null && _isInitialized) {
      _controller!.pause();
    }
  }

  @override
  void dispose() {
    // Don't dispose here - let FeedBloc manage controller lifecycle
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        // Thumbnail background
        CachedNetworkImage(
          imageUrl: widget.video.thumbUrl,
          fit: BoxFit.cover,
          placeholder: (context, url) => Container(color: Colors.black),
          errorWidget: (context, url, error) => Container(color: Colors.black),
        ),

        // Video player
        if (_isInitialized && _controller != null)
          Center(
            child: AspectRatio(
              aspectRatio: _controller!.value.aspectRatio,
              child: VideoPlayer(_controller!),
            ),
          ),

        // Play button overlay
        if (_showPlayButton)
          Center(
            child: GestureDetector(
              onTap: () {
                if (_controller != null) {
                  _controller!.play();
                  setState(() => _showPlayButton = false);
                }
              },
              child: Container(
                decoration: BoxDecoration(
                  color: Colors.black.withOpacity(0.3),
                  shape: BoxShape.circle,
                ),
                padding: EdgeInsets.all(16),
                child: Icon(
                  Icons.play_arrow,
                  color: Colors.white,
                  size: 40,
                ),
              ),
            ),
          ),

        // Video info overlay
        Positioned(
          bottom: 0,
          left: 0,
          right: 0,
          child: Container(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Colors.transparent, Colors.black87],
              ),
            ),
            padding: EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  '@${widget.video.username}',
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                  ),
                ),
                SizedBox(height: 8),
                Text(
                  widget.video.caption,
                  style: TextStyle(color: Colors.white, fontSize: 14),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ),

        // Action buttons
        Positioned(
          bottom: 16,
          right: 16,
          child: Column(
            children: [
              _ActionButton(
                icon: Icons.favorite,
                label: _formatCount(widget.video.likeCount),
              ),
              SizedBox(height: 16),
              _ActionButton(
                icon: Icons.comment,
                label: _formatCount(widget.video.commentCount),
              ),
              SizedBox(height: 16),
              _ActionButton(
                icon: Icons.share,
                label: 'Share',
              ),
            ],
          ),
        ),
      ],
    );
  }

  String _formatCount(int count) {
    if (count >= 1000000) return '${(count / 1000000).toStringAsFixed(1)}M';
    if (count >= 1000) return '${(count / 1000).toStringAsFixed(1)}K';
    return count.toString();
  }
}

class _ActionButton extends StatelessWidget {
  final IconData icon;
  final String label;

  const _ActionButton({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          decoration: BoxDecoration(
            color: Colors.black.withOpacity(0.3),
            shape: BoxShape.circle,
          ),
          padding: EdgeInsets.all(12),
          child: Icon(icon, color: Colors.white, size: 24),
        ),
        SizedBox(height: 4),
        Text(
          label,
          style: TextStyle(color: Colors.white, fontSize: 12),
        ),
      ],
    );
  }
}
