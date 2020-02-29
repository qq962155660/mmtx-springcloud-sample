package io.mmtx.demo.rest;

import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;



import io.mmtx.demo.netty.ChannelMap;
import io.mmtx.demo.netty.CustomHeartbeatHandler;
import io.mmtx.demo.service.TestServerService;
import io.netty.buffer.ByteBuf;
import io.netty.channel.Channel;

@RestController
public class TestServerController {
	@Autowired
	private TestServerService testServerService;

	@GetMapping("/server/push/all/{msg}")
	public Boolean insertRow(@PathVariable("msg")String msg){
		Map<String,Channel> cs = ChannelMap.getAllChannel();
		for (String key : cs.keySet()) {
			Channel channel = cs.get(key);
			if(channel.isActive()){
				if (channel != null && channel.isActive()) {
	                ByteBuf buf = channel.alloc().buffer(5 + msg.getBytes().length);
	                buf.writeInt(5 + msg.getBytes().length);
	                buf.writeByte(CustomHeartbeatHandler.CUSTOM_MSG);
	                buf.writeBytes(msg.getBytes());
	                channel.writeAndFlush(buf);
	            }
				System.out.println("push id:"+key);
			}
			
		}
		return true;
	}
	
	@GetMapping("/server/remove/all")
	public Boolean remove(){
		Map<String,Channel> cs = ChannelMap.getAllChannel();
		for (String key : cs.keySet()) {
			Channel channel = cs.get(key);
			if(channel.isActive()){
				channel.close();
				cs.remove(key);
			}
			
		}
		return true;
	}
}
