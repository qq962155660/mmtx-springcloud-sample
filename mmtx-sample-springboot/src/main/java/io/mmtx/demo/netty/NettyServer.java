package io.mmtx.demo.netty;

import java.net.InetSocketAddress;

import io.netty.bootstrap.ServerBootstrap;
import io.netty.channel.ChannelFuture;
import io.netty.channel.ChannelOption;
import io.netty.channel.EventLoopGroup;
import io.netty.channel.nio.NioEventLoopGroup;
import io.netty.channel.socket.nio.NioServerSocketChannel;

public class NettyServer {
	ServerBootstrap bootstrap;
	public void start(InetSocketAddress socketAddress) {
		// new 一个主线程组
		EventLoopGroup bossGroup = new NioEventLoopGroup(1);
		// new 一个工作线程组
		EventLoopGroup workGroup = new NioEventLoopGroup(200);
		bootstrap = new ServerBootstrap()
				.group(bossGroup, workGroup)
				.channel(NioServerSocketChannel.class)
				.childHandler(new ServerChannelInitializer())
				.localAddress(socketAddress);
			
		// 绑定端口,开始接收进来的连接
		try {
			ChannelFuture future = bootstrap.bind(socketAddress).sync();
			System.out.println("服务器启动开始监听端口: " + socketAddress.getPort());
			future.channel().closeFuture().sync();
		} catch (InterruptedException e) {
			e.printStackTrace();
		} finally {
			// 关闭主线程组
			bossGroup.shutdownGracefully();
			// 关闭工作线程组
			workGroup.shutdownGracefully();
		}
	}
}
