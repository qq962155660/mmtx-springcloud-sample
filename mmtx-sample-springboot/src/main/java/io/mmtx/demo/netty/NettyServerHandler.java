package io.mmtx.demo.netty;

import io.netty.channel.Channel;
import io.netty.channel.ChannelHandlerContext;
import io.netty.channel.ChannelInboundHandlerAdapter;
import io.netty.channel.SimpleChannelInboundHandler;

public class NettyServerHandler extends SimpleChannelInboundHandler<String> {
	
		private final String REC_ACK = "ack";
		
		@Override
	    protected void channelRead0(ChannelHandlerContext ctx, String data) throws Exception {
	        try {
//	            System.out.println("receive data: " + data);
//	            ctx.writeAndFlush(REC_ACK);
	        } catch (Exception e) {
	            e.printStackTrace();
	        }
	    }

	    @Override
	    public void channelActive(ChannelHandlerContext ctx) throws Exception {
	    	System.out.println("first connect client id :"+ctx.channel().id().asLongText());
	        ChannelMap.addChannel(ctx.channel().id().asLongText(), ctx.channel());
	        ctx.fireChannelActive();
	    }

	    @Override
	    public void channelInactive(ChannelHandlerContext ctx) throws Exception {
	        System.out.println("Disconnected with the remote client.");
	        // do something
	        ChannelMap.remove(ctx.channel().id().asLongText());
	        ctx.fireChannelInactive();
	    }

	    @Override
	    public void exceptionCaught(ChannelHandlerContext ctx, Throwable cause) throws Exception {
	        cause.printStackTrace();
	        ctx.close();
	    }
}
