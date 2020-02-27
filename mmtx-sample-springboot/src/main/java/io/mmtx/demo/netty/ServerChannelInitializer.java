package io.mmtx.demo.netty;


import io.netty.channel.ChannelInitializer;
import io.netty.channel.socket.SocketChannel;
import io.netty.handler.codec.LengthFieldBasedFrameDecoder;
import io.netty.handler.codec.LengthFieldPrepender;
import io.netty.handler.codec.string.StringDecoder;
import io.netty.handler.codec.string.StringEncoder;
import io.netty.handler.timeout.IdleStateHandler;
import io.netty.util.CharsetUtil;

public class ServerChannelInitializer extends ChannelInitializer<SocketChannel> {
	 @Override
	    protected void initChannel(SocketChannel socketChannel) throws Exception {
		 socketChannel.pipeline().addLast("idleStateHandler", new IdleStateHandler(5, 0, 0));
		 socketChannel.pipeline().addLast("idleStateTrigger", new ServerIdleStateTrigger());
		 socketChannel.pipeline().addLast("frameDecoder", new LengthFieldBasedFrameDecoder(Integer.MAX_VALUE, 0, 4, 0, 4));
		 socketChannel.pipeline().addLast("frameEncoder", new LengthFieldPrepender(4));
	        socketChannel.pipeline().addLast("decoder", new StringDecoder(CharsetUtil.UTF_8));
	        socketChannel.pipeline().addLast("encoder", new StringEncoder(CharsetUtil.UTF_8));
	        socketChannel.pipeline().addLast(new NettyServerHandler());
	    }
}
