package io.mmtx.demo.netty;

import java.net.InetSocketAddress;

import io.netty.bootstrap.ServerBootstrap;
import io.netty.channel.Channel;
import io.netty.channel.ChannelInitializer;
import io.netty.channel.ChannelPipeline;
import io.netty.channel.nio.NioEventLoopGroup;
import io.netty.channel.socket.SocketChannel;
import io.netty.channel.socket.nio.NioServerSocketChannel;
import io.netty.handler.codec.LengthFieldBasedFrameDecoder;
import io.netty.handler.timeout.IdleStateHandler;

public class Server {
    public void start(InetSocketAddress localAddress){
    	  NioEventLoopGroup bossGroup = new NioEventLoopGroup(1);
          NioEventLoopGroup workGroup = new NioEventLoopGroup(4);
          try {
              ServerBootstrap bootstrap = new ServerBootstrap();
              bootstrap
                      .group(bossGroup, workGroup)
                      .channel(NioServerSocketChannel.class)
                      .childHandler(new ChannelInitializer<SocketChannel>() {
                          protected void initChannel(SocketChannel socketChannel) throws Exception {
                              ChannelPipeline p = socketChannel.pipeline();
                              p.addLast(new IdleStateHandler(10, 0, 0));
                              p.addLast(new LengthFieldBasedFrameDecoder(1024, 0, 4, -4, 0));
                              p.addLast(new ServerHandler());
                          }
                      }).localAddress(localAddress);
   
              Channel ch = bootstrap.bind(localAddress).sync().channel();
              System.out.println("netty-server start...");
              ch.closeFuture().sync();
          } catch (Exception e) {
              throw new RuntimeException(e);
          } finally {
              bossGroup.shutdownGracefully();
              workGroup.shutdownGracefully();
          }
    }
}