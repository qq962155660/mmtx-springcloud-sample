import io.netty.bootstrap.Bootstrap;
import io.netty.channel.ChannelFuture;
import io.netty.channel.ChannelHandlerContext;
import io.netty.channel.ChannelInboundHandlerAdapter;
import io.netty.channel.ChannelInitializer;
import io.netty.channel.ChannelOption;
import io.netty.channel.EventLoopGroup;
import io.netty.channel.nio.NioEventLoopGroup;
import io.netty.channel.socket.SocketChannel;
import io.netty.channel.socket.nio.NioSocketChannel;
import io.netty.handler.codec.string.StringDecoder;
import io.netty.handler.codec.string.StringEncoder;

public class TestClient {
	public static void main(String[] args) {
		TestClient t = new TestClient();
		t.start();
	}

	public void start() {
		EventLoopGroup group = new NioEventLoopGroup();
		Bootstrap bootstrap = new Bootstrap().group(group)
				// 该参数的作用就是禁止使用Nagle算法，使用于小数据即时传输
				.option(ChannelOption.TCP_NODELAY, true).channel(NioSocketChannel.class)
				.handler(new NettyClientInitializer());

		try {
//			ChannelFuture future = bootstrap.connect("47.97.103.128", 18003).sync();
			ChannelFuture future = bootstrap.connect("127.0.0.1", 18003).sync();
			System.out.println("客户端成功....");
			// 发送消息
			future.channel().writeAndFlush("你好啊");
			// 等待连接被关闭
			future.channel().closeFuture().sync();
		} catch (InterruptedException e) {
			e.printStackTrace();
		} finally {
			group.shutdownGracefully();
		}
	}
}

class NettyClientHandler extends ChannelInboundHandlerAdapter {
	@Override
	public void channelActive(ChannelHandlerContext ctx) throws Exception {
		System.out.println("客户端Active .....");
	}

	@Override
	public void channelRead(ChannelHandlerContext ctx, Object msg) throws Exception {
		System.out.println("客户端收到消息:" + msg.toString());
	}

	@Override
	public void exceptionCaught(ChannelHandlerContext ctx, Throwable cause) throws Exception {
		cause.printStackTrace();
		ctx.close();
	}
}

class NettyClientInitializer extends ChannelInitializer<SocketChannel> {
	@Override
	protected void initChannel(SocketChannel socketChannel) throws Exception {
		socketChannel.pipeline().addLast("decoder", new StringDecoder());
		socketChannel.pipeline().addLast("encoder", new StringEncoder());
		socketChannel.pipeline().addLast(new NettyClientHandler());
	}
}
