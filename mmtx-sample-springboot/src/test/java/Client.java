
import java.util.concurrent.TimeUnit;

import io.netty.bootstrap.Bootstrap;
import io.netty.buffer.ByteBuf;
import io.netty.channel.Channel;
import io.netty.channel.ChannelFuture;
import io.netty.channel.ChannelFutureListener;
import io.netty.channel.ChannelInitializer;
import io.netty.channel.ChannelPipeline;
import io.netty.channel.nio.NioEventLoopGroup;
import io.netty.channel.socket.SocketChannel;
import io.netty.channel.socket.nio.NioSocketChannel;
import io.netty.handler.codec.LengthFieldBasedFrameDecoder;
import io.netty.handler.timeout.IdleStateHandler;


	public class Client {
	   public static void main(String[] args) throws Exception {
	        Client client = new Client();
	        client.start();
	        client.sendData("123");
	    }
		
	   String remoteAddr = "127.0.0.1";
		int remotePort = 18003;
	    private NioEventLoopGroup workGroup = new NioEventLoopGroup(4);
	    private Channel channel;
	    private Bootstrap bootstrap;
	 
	    public void sendData(String content) throws Exception {
	            if (channel != null && channel.isActive()) {
	                ByteBuf buf = channel.alloc().buffer(5 + content.getBytes().length);
	                buf.writeInt(5 + content.getBytes().length);
	                buf.writeByte(CustomHeartbeatHandler.CUSTOM_MSG);
	                buf.writeBytes(content.getBytes());
	                channel.writeAndFlush(buf);
	            }
	 
	    }
	 
	    public void start() {
	        try {
	            bootstrap = new Bootstrap();
	            bootstrap
	                    .group(workGroup)
	                    .channel(NioSocketChannel.class)
	                    .handler(new ChannelInitializer<SocketChannel>() {
	                        protected void initChannel(SocketChannel socketChannel) throws Exception {
	                            ChannelPipeline p = socketChannel.pipeline();
	                            p.addLast(new IdleStateHandler(0, 0, 5));
	                            p.addLast(new LengthFieldBasedFrameDecoder(1024, 0, 4, -4, 0));
	                            p.addLast(new ClientHandler(Client.this));
	                        }
	                    });
	            doConnect();
	 
	        } catch (Exception e) {
	            throw new RuntimeException(e);
	        }
	    }
	 
	    protected void doConnect() {
	        if (channel != null && channel.isActive()) {
	            return;
	        }
	 
	        ChannelFuture future = bootstrap.connect(remoteAddr, remotePort);
	 
	        future.addListener(new ChannelFutureListener() {
	            public void operationComplete(ChannelFuture futureListener) throws Exception {
	                if (futureListener.isSuccess()) {
	                    channel = futureListener.channel();
	                    System.out.println("Connect to server successfully!");
	                } else {
	                    System.out.println("Failed to connect to server, try connect after 10s");
	 
	                    futureListener.channel().eventLoop().schedule(new Runnable() {
	                        @Override
	                        public void run() {
	                            doConnect();
	                        }
	                    }, 10, TimeUnit.SECONDS);
	                }
	            }
	        });
	    }
	 
	}